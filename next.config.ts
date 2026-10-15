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
    // AVIF first, WebP as the fallback: Next serves the first format the
    // browser's Accept header allows, and caches each format separately.
    formats: ["image/avif", "image/webp"],
    // 31 days instead of the 4-hour default. The optimised copy is keyed by
    // the source URL and cannot be purged, so give a replaced image in
    // public/ a new file name rather than overwriting the old one.
    minimumCacheTTL: 2678400,
  },
  experimental: {
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
