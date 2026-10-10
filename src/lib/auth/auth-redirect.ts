/**
 * Builds a redirect to one of the auth screens while carrying the context the
 * visitor arrived with. Every error and retry path must keep `next` (where to
 * land after signing in) and `invite` (a pending team invitation); dropping
 * either silently sends an invited teammate into a brand-new workspace.
 */
export type AuthRedirectParams = {
  error?: string;
  next?: string;
  invite?: string;
  email?: string;
  [key: string]: string | undefined;
};

const MAX_INVITE_LENGTH = 512;

export function sanitizeInvite(value: string | null | undefined): string {
  return typeof value === "string" && value.length <= MAX_INVITE_LENGTH ? value : "";
}

export function authPageUrl(pathname: string, params: AuthRedirectParams, origin: string): URL {
  const url = new URL(pathname, origin);
  for (const [key, value] of Object.entries(params)) {
    const text = key === "invite" ? sanitizeInvite(value) : value;
    if (text) url.searchParams.set(key, text);
  }
  return url;
}
