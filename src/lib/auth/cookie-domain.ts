type AuthOrigins = {
  appUrl: string;
  adminUrl: string;
  publicSiteUrl: string;
};

function belongsTo(hostname: string, parent: string): boolean {
  return hostname === parent || hostname.endsWith(`.${parent}`);
}

/**
 * Returns a parent cookie domain only when every application origin is a
 * trusted HTTPS host beneath the public site. Local development and unrelated
 * hosts stay host-only.
 */
export function sharedAuthCookieDomain(origins: AuthOrigins): string | undefined {
  const app = new URL(origins.appUrl);
  const admin = new URL(origins.adminUrl);
  const site = new URL(origins.publicSiteUrl);
  const parent = site.hostname.toLowerCase();
  if (
    app.protocol !== "https:"
    || admin.protocol !== "https:"
    || site.protocol !== "https:"
    || parent === "localhost"
    || !parent.includes(".")
  ) return undefined;

  return belongsTo(app.hostname.toLowerCase(), parent)
    && belongsTo(admin.hostname.toLowerCase(), parent)
    ? parent
    : undefined;
}
