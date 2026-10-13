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
  async headers() {
    return securityHeaderRules(isProduction);
  },
};

export default nextConfig;
