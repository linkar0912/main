import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { isSafeOutboundUrl } from "@/src/lib/security/outbound-url";
import { logger } from "@/src/lib/logger";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const MAX_DESTINATION_LENGTH = 2_000;
const MAX_UTM_LENGTH = 200;
const MAX_NOTES_LENGTH = 240;
const MAX_CONVERSION_LENGTH = 2_000;

type UtmField = "utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent";

const UTM_FIELDS: UtmField[] = ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"];

function readUtmField(payload: Record<string, unknown>, key: UtmField): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_UTM_LENGTH) : undefined;
}

function appendUtm(destination: string, link: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmTerm?: string; utmContent?: string }): string {
  // Re-validate the destination before composing the final link. The destination
  // was checked at create-time, but a future code path that lets the destination
  // change without re-validating would otherwise bypass the safety check and let
  // a non-public URL through with UTM params attached.
  if (!isSafeOutboundUrl(destination)) {
    throw new Error("Outbound destination is not publicly routable");
  }
  const url = new URL(destination);
  const params = url.searchParams;
  if (link.utmSource) params.set("utm_source", link.utmSource);
  if (link.utmMedium) params.set("utm_medium", link.utmMedium);
  if (link.utmCampaign) params.set("utm_campaign", link.utmCampaign);
  if (link.utmTerm) params.set("utm_term", link.utmTerm);
  if (link.utmContent) params.set("utm_content", link.utmContent);
  return url.toString();
}

export { appendUtm as appendUtmToDestination };

// POST /api/links - create a new tracked link.
export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const payload = (body ?? {}) as Record<string, unknown>;
  const slug = typeof payload.slug === "string" ? payload.slug.trim().toLowerCase() : "";
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: "slug must be 1-41 characters of lowercase letters, numbers, dashes, or underscores" },
      { status: 400 },
    );
  }
  const destination = typeof payload.destination === "string" ? payload.destination.trim() : "";
  if (!destination || destination.length > MAX_DESTINATION_LENGTH || !isSafeOutboundUrl(destination)) {
    return NextResponse.json(
      { error: "destination must be a public http(s) URL" },
      { status: 400 },
    );
  }
  let expiresAt: string | undefined;
  if (typeof payload.expiresAt === "string" && payload.expiresAt.trim()) {
    const parsed = new Date(payload.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "expiresAt must be an ISO datetime" }, { status: 400 });
    }
    expiresAt = parsed.toISOString();
  }
  const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, MAX_NOTES_LENGTH) || undefined : undefined;
  let conversionUrl: string | undefined;
  if (typeof payload.conversionUrl === "string" && payload.conversionUrl.trim()) {
    const candidate = payload.conversionUrl.trim();
    if (candidate.length > MAX_CONVERSION_LENGTH || !isSafeOutboundUrl(candidate)) {
      return NextResponse.json({ error: "conversionUrl must be a public http(s) URL" }, { status: 400 });
    }
    conversionUrl = candidate;
  }
  const utm: Record<UtmField, string | undefined> = {
    utmSource: readUtmField(payload, "utmSource"),
    utmMedium: readUtmField(payload, "utmMedium"),
    utmCampaign: readUtmField(payload, "utmCampaign"),
    utmTerm: readUtmField(payload, "utmTerm"),
    utmContent: readUtmField(payload, "utmContent"),
  };
  void UTM_FIELDS; // ensure import is used even if a future field is removed

  const repository = getRepository();
  try {
    await getEntitlementService().assertEntitled(session.workspaceId, "tracked_links", 0);
    const link = await repository.createTrackedLink(session.workspaceId, {
      slug,
      destination,
      ...(expiresAt ? { expiresAt } : {}),
      ...(notes ? { notes } : {}),
      ...(conversionUrl ? { conversionUrl } : {}),
      ...(utm.utmSource ? { utmSource: utm.utmSource } : {}),
      ...(utm.utmMedium ? { utmMedium: utm.utmMedium } : {}),
      ...(utm.utmCampaign ? { utmCampaign: utm.utmCampaign } : {}),
      ...(utm.utmTerm ? { utmTerm: utm.utmTerm } : {}),
      ...(utm.utmContent ? { utmContent: utm.utmContent } : {}),
      createdByUserId: session.userId,
    });
    return NextResponse.json({ data: link });
  } catch (error) {
    const entitlementResponse = entitlementErrorResponse(error);
    if (entitlementResponse) return entitlementResponse;
    if (error instanceof Error && error.message.includes("already used")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logger.error("Failed to create tracked link", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not create the link" }, { status: 500 });
  }
}

// GET /api/links - list the workspace's tracked links.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const links = await getRepository().listTrackedLinks(session.workspaceId, limit);
  return NextResponse.json({ data: links });
}
