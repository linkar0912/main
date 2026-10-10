import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";
import { afterResponse } from "@/src/lib/after-response";
import { getServerEnv } from "@/src/lib/env";
import { clientAddress } from "@/src/lib/auth/client-address";
import { isSafeOutboundUrl, postJsonToSafeOutboundTarget } from "@/src/lib/security/outbound-url";

export const runtime = "nodejs";

// How long the visitor's browser will wait on the conversion-webhook POST before
// we give up. Without this, a slow customer endpoint ties up a Node socket
// (and a request slot) for the full keep-alive timeout.
const CONVERSION_CALLBACK_TIMEOUT_MS = 5_000;

// Click IPs are keyed with HMAC under a key derived from the server's session
// secret. A static committed salt let anyone with a database copy brute-force
// the IPv4 space (2^32 hashes) back to raw addresses; a server-held key does
// not. Deriving (rather than reusing the secret directly) keeps the two uses
// cryptographically separate without a new required environment variable.
function clickHashKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("linkar.click-ip.v2").digest();
}

function hashIp(ipAddress: string, secret: string): string {
  if (!ipAddress || ipAddress === "unknown") return "anon";
  return createHmac("sha256", clickHashKey(secret)).update(ipAddress).digest("hex").slice(0, 16);
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

// GET /r/[slug] - public redirect. Records a click (with keyed IP hash) then
// 302s the visitor to the destination with UTM params appended. Disabled links
// and links of a non-ACTIVE workspace resolve as not found.
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const repository = getRepository();
  const link = await repository.getTrackedLinkBySlugPublic(slug);
  if (!link) return new NextResponse("Link not found", { status: 404 });
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
    return new NextResponse("This link has expired", { status: 410 });
  }
  // Same trusted-proxy rules as the login limiter: the first X-Forwarded-For
  // entry is client-controlled, so it would let a visitor pick their own
  // "unique" identity and inflate unique-click counts.
  const env = getServerEnv();
  const ipHash = hashIp(clientAddress(request, env.trustedProxyHops), env.authSessionSecret);
  const country = readCountry(request);
  const userAgent = readUserAgent(request);
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
  // Only a link that actually forwards counts as a click. Recording (and the
  // conversion callback) runs after the redirect is sent and is best-effort:
  // a failure must never block or delay the visitor.
  afterResponse("Tracked-link click recording", async () => {
    await repository.recordTrackedLinkClick(link.id, {
      workspaceId: link.workspaceId,
      ipHash,
      ...(userAgent ? { userAgent } : {}),
      ...(country ? { country } : {}),
    });
    if (link.conversionUrl) {
      try {
        // Validated, DNS-pinned (no rebinding between check and connect) and
        // never redirected: a 3xx from the customer endpoint is not followed.
        await postJsonToSafeOutboundTarget(
          link.conversionUrl,
          { slug, linkId: link.id, country: country ?? null, at: new Date().toISOString() },
          { timeoutMs: CONVERSION_CALLBACK_TIMEOUT_MS },
        );
      } catch (error) {
        logger.warn("Conversion callback failed", {
          linkId: link.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
  return NextResponse.redirect(finalDestination, 302);
}
