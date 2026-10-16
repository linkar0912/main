import { ANALYTICS_PAGE_PATHS } from "../analytics-path";

/**
 * Response security headers, applied by next.config.ts. Kept here, free of
 * framework imports, so the policy can be unit tested.
 *
 * script-src keeps 'unsafe-inline' and has no nonce. Next.js injects inline
 * bootstrap scripts, and a nonce has to be minted per request, which turns
 * every page dynamic: the prerendered marketing pages and the static app
 * shells would all lose their static HTML. React escapes rendered text, no
 * page renders user HTML, and only the hosts below may serve script.
 */

type Sources = { script?: string[]; connect?: string[]; img?: string[]; frame?: string[] };

// Instagram media thumbnails and avatars load directly from Meta's CDNs in the
// media picker and settings. Arbitrary remote hosts are deliberately not
// allowed - user-entered preview image URLs outside this list are blocked.
const META_IMAGES = [
  "https://*.cdninstagram.com",
  "https://cdninstagram.com",
  "https://*.fbcdn.net",
  "https://fbcdn.net",
  "https://*.facebook.com",
  "https://platform-lookaside.fbsbx.com",
  "https://lookaside.fbsbx.com",
  "https://lookaside.facebook.net",
];

// Razorpay Checkout (billing, in Settings): the loader script, the checkout
// iframe, its telemetry beacon and its logos. Allowed on every app page, not
// just /settings, because a CSP belongs to the document: a session that
// starts on /dashboard reaches Settings by client-side navigation and keeps
// the dashboard's policy.
const RAZORPAY: Sources = {
  script: ["https://checkout.razorpay.com"],
  frame: ["https://api.razorpay.com", "https://checkout.razorpay.com"],
  connect: ["https://api.razorpay.com", "https://lumberjack.razorpay.com"],
  img: ["https://cdn.razorpay.com"],
};

// Google Analytics 4 needs all three: the gtag loader, the collect beacons,
// and the tracking-pixel fallback. Missing any one fails silently. Once
// analytics storage is granted, gtag.js also sends a copy of each hit to
// www.google.com/g/collect (seen in a browser against G-CLMXQ4YFD1); without
// that host every page logs a CSP violation.
const GOOGLE_ANALYTICS: Sources = {
  script: ["https://www.googletagmanager.com"],
  connect: ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://www.google.com"],
  img: ["https://*.google-analytics.com", "https://*.googletagmanager.com", "https://www.google.com"],
};

// Cloudflare Web Analytics: Cloudflare injects this beacon into proxied HTML.
const CLOUDFLARE_WEB_ANALYTICS: Sources = {
  script: ["https://static.cloudflareinsights.com"],
  connect: ["https://cloudflareinsights.com"],
};

// The production app and owner-console hosts. These mirror APP_HOST and
// ADMIN_HOST in src/lib/site-routing.ts (a test keeps them equal). They are
// not imported from there because next.config.ts loads this file in the
// runtime container, and only the files the Dockerfile copies can be imported.
const PRODUCTION_APP_HOST = "app.linkar.in";
const PRODUCTION_ADMIN_HOST = "admin.linkar.in";

/**
 * Where a form on this origin may submit, redirects included. The login,
 * logout and auth routes answer with a 303 to the app or the owner console
 * (applicationOriginForPath), so on admin.linkar.in a sign-in that lands on
 * app.linkar.in, or the reverse, must be allowed or the browser blocks it.
 * Outside production both resolve to the dev server's own origin.
 */
export function formActionSources(production: boolean): string[] {
  return production
    ? ["'self'", `https://${PRODUCTION_APP_HOST}`, `https://${PRODUCTION_ADMIN_HOST}`]
    : ["'self'"];
}

function merge(...sets: Sources[]): Required<Sources> {
  const out: Required<Sources> = { script: [], connect: [], img: [], frame: [] };
  for (const set of sets) {
    for (const key of Object.keys(out) as (keyof Sources)[]) out[key].push(...(set[key] ?? []));
  }
  return out;
}

export function contentSecurityPolicy({ production, publicSite }: { production: boolean; publicSite: boolean }): string {
  const extra = merge(RAZORPAY, ...(publicSite ? [GOOGLE_ANALYTICS, CLOUDFLARE_WEB_ANALYTICS] : []));
  const list = (...sources: string[]) => sources.join(" ");
  return [
    "default-src 'self'",
    // Dev mode also relies on eval for React refresh.
    `script-src ${list("'self'", "'unsafe-inline'", ...extra.script, ...(production ? [] : ["'unsafe-eval'"]))}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", "data:", "blob:", ...META_IMAGES, ...extra.img)}`,
    "font-src 'self' data:",
    `connect-src ${list("'self'", ...extra.connect)}`,
    `frame-src ${list("'self'", ...extra.frame)}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action ${list(...formActionSources(production))}`,
  ].join("; ");
}

type Header = { key: string; value: string };

export function securityHeaders(production: boolean): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ production, publicSite: false }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    // Severs window references between this app and cross-origin windows that
    // open it (tab-nabbing, cross-site leaks). "allow-popups" keeps the
    // reference only for popups this page opens itself: Razorpay Checkout's
    // bank and 3-D Secure steps need their opener. Like the CSP it is fixed per
    // document, so it cannot be relaxed for /settings alone - most sessions
    // reach Settings by client-side navigation from another page.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    // Ignored by browsers over plain HTTP (local dev), enforced once served
    // over HTTPS. includeSubDomains is deliberate: every linkar.in host is
    // HTTPS-only behind Cloudflare. `preload` makes the apex eligible for the
    // browser preload list; submitting it at hstspreload.org is a separate,
    // hard-to-reverse decision that nothing here makes.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ];
}

type HeaderRule = { source: string; headers: Header[] };

/** The `headers()` rules for next.config.ts. Later rules win for the same key. */
export function securityHeaderRules(production: boolean): HeaderRule[] {
  const publicSitePolicy = [{ key: "Content-Security-Policy", value: contentSecurityPolicy({ production, publicSite: true }) }];
  return [
    { source: "/:path*", headers: securityHeaders(production) },
    // The public website pages, the SEO catalogue hubs and guides included,
    // may load Google Analytics and the Cloudflare Web Analytics beacon.
    // Nothing else may: each source is an exact path, so an unknown slug or a
    // template's /recipe download keeps the base policy above.
    ...ANALYTICS_PAGE_PATHS.map((source) => ({ source, headers: publicSitePolicy })),
  ];
}
