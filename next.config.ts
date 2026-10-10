import type { NextConfig } from "next";

// Next.js injects inline bootstrap/hydration scripts, so script-src needs
// 'unsafe-inline' without a nonce-based middleware pipeline. Dev mode also
// relies on eval for React refresh.
const isProduction = process.env.NODE_ENV === "production";
// Google Analytics 4 needs three separate allowances: the gtag loader script,
// the collect beacons, and the tracking pixel fallback. Without all three the
// tag silently fails - the loader 404s to a CSP violation and no hit is sent.
const googleAnalyticsScript = "https://*.googletagmanager.com";
const googleAnalyticsConnect =
  "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${googleAnalyticsScript}${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // Instagram media thumbnails and avatars load directly from Meta's CDNs in
  // the media picker and settings; the GA4 tracking-pixel fallback is an img.
  // Arbitrary remote hosts are deliberately not allowed - user-entered
  // preview image URLs outside this list are blocked by design.
  "img-src 'self' data: blob: https://*.cdninstagram.com https://cdninstagram.com https://*.fbcdn.net https://fbcdn.net https://*.facebook.com https://platform-lookaside.fbsbx.com https://lookaside.fbsbx.com https://lookaside.facebook.net https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self' data:",
  `connect-src 'self' ${googleAnalyticsConnect}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Severs window references between this app and cross-origin windows that
  // open it (tab-nabbing, cross-site leaks).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Ignored by browsers over plain HTTP (local dev), enforced once served over HTTPS.
  // includeSubDomains is deliberate: every linkar.in host is HTTPS-only behind
  // Cloudflare, and this app also answers on the apex. `preload` is not sent:
  // preload-list submission is a one-way, apex-only decision to make
  // explicitly, and app./admin. responses cannot qualify for it anyway.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  reactStrictMode: true,
  // The floating dev-tools badge sits over the sidebar's bottom-left content
  // (workspace chip, sign out) on every screen - move it out of the way.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Billing (in Settings) runs Razorpay Checkout, whose bank and 3-D Secure
      // steps can open a payment popup that must keep its opener. The last
      // matching header with the same key wins.
      { source: "/settings/:path*", headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }] },
    ];
  },
};

export default nextConfig;