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
