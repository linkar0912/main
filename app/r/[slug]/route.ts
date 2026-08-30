import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";
import { isSafeOutboundUrl } from "@/src/lib/security/outbound-url";

export const runtime = "nodejs";

// How long the visitor's browser will wait on the conversion-webhook POST before
// we give up. Without this, a slow customer endpoint ties up a Node socket
// (and a request slot) for the full keep-alive timeout.
const CONVERSION_CALLBACK_TIMEOUT_MS = 5_000;

// A non-secret salt keeps the IP hash stable across deployments without revealing
// the raw address. A pure-cryptographic random per deployment is also fine; this
// value was chosen once and is committed to the repo.
const IP_HASH_SALT = "linkar.click.v1";

function hashIp(ipAddress: string | null): string {
  if (!ipAddress) return "anon";
  return createHash("sha256").update(`${IP_HASH_SALT}:${ipAddress}`).digest("hex").slice(0, 16);
}

function readForwardedFor(request: Request): string | null {
  const header = request.headers.get("x-forwarded-for");
  if (!header) return null;
  return header.split(",")[0]?.trim() ?? null;
}

function readCountry(request: Request): string | undefined {
  const country = request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country");
  if (!country) return undefined;
  return country.slice(0, 8);
}

function readUserAgent(request: Request): string | undefined {
  const ua = request.headers.get("user-agent");
  if (!ua) return undefined;
  return ua.slice(0, 240);
}

/**
 * Appends UTM params to `destination`, or returns null when `destination` is
 * not a safe public http(s) URL - unparseable (the workspace owner typed
 * `mailto:`, `tel:`, a stray space), a `javascript:`/`data:` scheme, or an
 * address on a private/link-local network. Returning null instead of throwing
 * keeps a single bad row from 500ing every click on the short link.
 *
 * Destinations are validated by isSafeOutboundUrl at create time in
 * /api/links, but rows predating that check (or written by a seed, import, or
 * direct DB edit) can still hold an unsafe value, so the redirect path
 * re-validates rather than trusting the stored value. Caller 404s.
 */
function appendUtm(destination: string, link: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string }): string | null {
  if (!isSafeOutboundUrl(destination)) return null;
  const url = new URL(destination);
  if (link.utmSource) url.searchParams.set("utm_source", link.utmSource);
  if (link.utmMedium) url.searchParams.set("utm_medium", link.utmMedium);
  if (link.utmCampaign) url.searchParams.set("utm_campaign", link.utmCampaign);
  if (link.utmTerm) url.searchParams.set("utm_term", link.utmTerm);
  if (link.utmContent) url.searchParams.set("utm_content", link.utmContent);
  return url.toString();
}

type RouteContext = { params: Promise<{ slug: string }> };

// GET /r/[slug] - public redirect. Records a click (with hashed IP) then 302s
// the visitor to the destination with UTM params appended.
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const repository = getRepository();
  const link = await repository.getTrackedLinkBySlugPublic(slug);
  if (!link) return new NextResponse("Link not found", { status: 404 });
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
    return new NextResponse("This link has expired", { status: 410 });
  }
  const ipHash = hashIp(readForwardedFor(request));
  const country = readCountry(request);
  const userAgent = readUserAgent(request);
  // Recording the click is best-effort: a failure must never block the redirect.
  void (async () => {
    try {
      await repository.recordTrackedLinkClick(link.id, {
        workspaceId: link.workspaceId,
        ipHash,
        ...(userAgent ? { userAgent } : {}),
        ...(country ? { country } : {}),
      });
      if (link.conversionUrl) {
        try {
          await fetch(link.conversionUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slug, linkId: link.id, country: country ?? null, at: new Date().toISOString() }),
            signal: AbortSignal.timeout(CONVERSION_CALLBACK_TIMEOUT_MS),
          });
        } catch (error) {
          logger.warn("Conversion callback failed", {
            linkId: link.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.warn("Failed to record tracked-link click", {
        linkId: link.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  const finalDestination = appendUtm(link.destination, link);
  if (!finalDestination) {
    // Destination is unparseable or not publicly routable. Treat it the same
    // way /api/t/[id] treats an unsafe outbound URL: 404, never bounce the
    // visitor to an attacker-controlled or malformed address.
    logger.warn("Rejected tracked-link with unsafe destination", {
      slug,
      linkId: link.id,
      workspaceId: link.workspaceId,
    });
    return new NextResponse("This link is unavailable", { status: 404 });
  }
  return NextResponse.redirect(finalDestination, 302);
}
