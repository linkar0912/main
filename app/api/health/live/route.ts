import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Answered by the running process on every call, never prerendered at build
// time (the build stage has no BUILD_COMMIT) and never cached.
export const dynamic = "force-dynamic";

/**
 * Liveness for the image's HEALTHCHECK (scripts/container-healthcheck.mjs).
 * It answers whenever this process can run a request handler and does no
 * database or Redis I/O, so a Valkey restart, a pooler blip or a saturated
 * pool cannot get the only web task replaced. Marketing pages and the login
 * form need neither dependency. Dependency state stays on /api/health, which
 * is the readiness view Dokploy's service healthcheck and the release tooling
 * read.
 */
export function GET() {
  return NextResponse.json(
    // BUILD_COMMIT is baked into the image and cannot drift from the running code.
    { status: "ok", release: process.env.BUILD_COMMIT || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
