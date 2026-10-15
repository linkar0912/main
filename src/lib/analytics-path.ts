/**
 * Analytics page paths must never carry an identifier out to Google.
 *
 * Two things leak by default: dynamic route segments (a deletion status code,
 * a workspace id) and the query string. Both are stripped here before any
 * page_view is sent, so GA sees the route shape and nothing else.
 *
 * Rules are explicit rather than "redact every segment that looks like an id"
 * because guessing gets static routes wrong - /automations/new is a page, not
 * an automation. Add a rule here whenever a new dynamic route appears.
 */
const redactions: { pattern: RegExp; replacement: string }[] = [
  // A lookup token for a deletion request. The most sensitive path on the site.
  { pattern: /^\/data-deletion\/status\/[^/]+/, replacement: "/data-deletion/status/:code" },
  { pattern: /^\/admin\/users\/[^/]+/, replacement: "/admin/users/:userId" },
  { pattern: /^\/admin\/workspaces\/[^/]+/, replacement: "/admin/workspaces/:workspaceId" },
];

/** Static siblings of /automations/[id] that must survive untouched. */
const automationStaticSegments = new Set(["new", "broadcasts", "sequences"]);

export function redactAnalyticsPath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";

  for (const { pattern, replacement } of redactions) {
    if (pattern.test(path)) return path.replace(pattern, replacement);
  }

  const automation = /^\/automations\/([^/]+)(\/.*)?$/.exec(path);
  if (automation && !automationStaticSegments.has(automation[1])) {
    return `/automations/:id${automation[2] ?? ""}`;
  }

  return path;
}

/**
 * The SEO catalogue: the /features, /solutions and /templates hubs plus one
 * guide per slug. The slugs are written out here instead of imported from
 * src/content/seo, which holds every guide's copy (about 170 KB minified).
 * This module ships in every page's client bundle through SiteAnalytics, and
 * next.config.ts loads it in the runtime image, which copies only the files
 * that config imports. analytics-path.test.ts fails when this list and the
 * catalogue differ, so a new guide is added here in the same change.
 *
 * The recipe downloads at /templates/<slug>/recipe are Markdown files, not
 * pages, and stay out.
 */
const SEO_CATALOGUE = {
  features: [
    "instagram-comment-to-dm", "instagram-dm-automation", "instagram-keyword-replies",
    "instagram-reel-comment-automation", "instagram-story-reply-automation",
    "instagram-story-mention-replies", "instagram-first-message-welcome",
    "instagram-email-capture", "instagram-follow-gate", "instagram-lead-qualification",
    "instagram-dm-follow-ups", "instagram-human-handoff", "instagram-link-tracking",
    "instagram-automation-analytics", "instagram-reply-ab-testing",
    "no-code-instagram-flow-builder", "instagram-contact-management",
    "facebook-comment-auto-reply", "facebook-keyword-comment-replies",
    "facebook-post-specific-replies",
  ],
  solutions: [
    "content-creators", "online-coaches", "course-creators", "ecommerce-brands",
    "small-businesses", "social-media-agencies", "affiliate-creators", "podcasters",
    "newsletter-creators", "fitness-coaches", "beauty-brands", "fashion-brands",
    "restaurants-cafes", "photographers", "event-organizers", "real-estate-teams",
    "travel-creators", "education-businesses", "local-service-businesses",
    "digital-product-sellers",
  ],
  templates: [
    "comment-guide-delivery", "reel-shopping-link", "story-offer-reply", "story-mention-thank-you",
    "first-message-welcome", "dm-price-list", "dm-business-hours", "dm-shipping-faq",
    "email-resource-delivery", "course-enquiry", "webinar-registration", "collaboration-intake",
    "giveaway-dm-entry", "giveaway-comment-confirmation", "follow-gated-freebie",
    "lead-qualification", "booking-link", "offer-follow-up", "support-handoff", "dm-link-menu",
    "facebook-product-faq", "facebook-opening-hours", "facebook-giveaway-reply",
    "facebook-support-acknowledgement",
  ],
} as const;

export const SEO_CATALOGUE_PATHS: readonly string[] = Object.entries(SEO_CATALOGUE).flatMap(
  ([collection, slugs]) => [`/${collection}`, ...slugs.map((slug) => `/${collection}/${slug}`)],
);

/**
 * The public website pages that load Google Analytics: the marketing, legal
 * and public help pages, sign-in and sign-up, and the SEO catalogue. Nothing
 * else does. The signed-in app and the owner console show private workspace
 * data and have analytics of their own, and pages such as /reset-password or
 * /data-deletion/status/<code> carry a secret in the address.
 *
 * Exact paths only, so a new route stays out until someone adds it here. The
 * same list scopes the Google Analytics allowances in the Content Security
 * Policy (src/lib/security/headers.ts, which next.config.ts applies), so the
 * tag cannot load anywhere else.
 */
export const ANALYTICS_PAGE_PATHS: readonly string[] = [
  "/",
  "/pricing",
  "/login",
  "/signup",
  "/forgot-password",
  "/contact",
  "/support",
  "/privacy",
  "/terms",
  "/acceptable-use",
  "/cookies",
  "/data-processing",
  "/service-providers",
  "/refund-policy",
  "/data-deletion",
  ...SEO_CATALOGUE_PATHS,
];

const analyticsPages = new Set<string>(ANALYTICS_PAGE_PATHS);

export function isAnalyticsPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/)[0];
  return analyticsPages.has(path.length > 1 ? path.replace(/\/+$/, "") : path);
}
