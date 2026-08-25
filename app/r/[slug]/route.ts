import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

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

function appendUtm(destination: string, link: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string }): string {
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
  return NextResponse.redirect(finalDestination, 302);
}
