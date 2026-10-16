import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security/headers";

// Content Security Policy and the other security headers live in
// src/lib/security/headers.ts, where they are unit tested.
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  reactStrictMode: true,
  // The floating dev-tools badge sits over the sidebar's bottom-left content
  // (workspace chip, sign out) on every screen - move it out of the way.
  devIndicators: { position: "bottom-right" },
  images: {
    // WebP only (the default). AVIF was tried and taken out: encoding one
    // 1920px hero took about 30 s of CPU on the production host against
    // 1.6 s for WebP, and a crawl asking for many uncached sizes at once
    // made the origin stop answering (502s, then a Cloudflare 1033).
    // 31 days instead of the 4-hour default. The optimised copy is keyed by
    // the source URL and cannot be purged, so give a replaced image in
    // public/ a new file name rather than overwriting the old one.
    minimumCacheTTL: 2678400,
    // Only the marketing photos are optimised (the /brand marks use
    // `unoptimized`). Without this, /_next/image runs any local path through
    // an internal request, API routes included, and skips their limiters.
    // `search: ""` refuses query strings, so one photo has one cache key.
    localPatterns: [{ pathname: "/marketing/**", search: "" }],
    // No source is wider than 1536 px, so the default widths up to 3840 only
    // added encodes that no screen needs. deviceSizes serve `sizes`/`fill`
    // photos; imageSizes cover the fixed-size ones (the 68 px proof rail
    // portraits get 128 for 1x and 256 for 2x).
    deviceSizes: [640, 828, 1080, 1200, 1536],
    imageSizes: [64, 128, 256, 384],
  },
  experimental: {
    // Next applies this only when sharp.concurrency() is above 1, giving one
    // libvips thread per encode instead of half of sharp's count. On the
    // production image (node:24-bookworm-slim: glibc, no jemalloc, no
    // MALLOC_ARENA_MAX) sharp already sets itself to 1, so this has no effect
    // there. Encodes still run in parallel, one per libuv pool slot, so up to
    // 8 at once with UV_THREADPOOL_SIZE=8 in the Dockerfile (4 without it).
    // The hard bound is the Cloudflare cache and rate rule on /_next/image,
    // which must be in place before deploy
    // (docs/ops/app-admin-inspection-2026-10-15.md, section 9).
    imgOptConcurrency: 1,
    // The proxy (proxy.ts matches /api/:path*) buffers each request body
    // before any route runs, 10 MB by default. No route takes more than 1 MB:
    // there are no uploads, and the Meta and Facebook callbacks cap at 1 MB
    // themselves. Past this, Next passes a truncated body on, which fails the
    // signature or JSON parse instead of holding memory.
    proxyClientMaxBodySize: "1mb",
    // Turbopack's default CSS chunking merged the catalogue's section styles
    // into chunks the homepage and /pricing link, adding about 20 KB gzip of
    // render-blocking CSS neither page uses. 'graph' groups CSS by which
    // routes import it (docs: 01-app/03-api-reference/05-config/01-next-config-js/cssChunking.md).
    // With the default weightDistribution (0.1) the 67 CSS-heavy catalogue
    // routes outvote the two pages that matter most, and catalogue styles
    // drift back onto / and /pricing as files change. 0.5 gives the routes
    // that import less CSS more weight; 0.2 was already enough, so this
    // leaves headroom. `pnpm check:css-budget` guards the result after a build.
    cssChunking: { type: "graph", weightDistribution: 0.5 },
  },
  async headers() {
    return securityHeaderRules(isProduction);
  },
};

export default nextConfig;
