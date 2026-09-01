export function nextRedirectTarget(
  status: number | undefined,
  location: string | undefined,
  currentUrl: string,
): string | null;

export function fetchFollowingRedirects(
  startUrl: string,
  options?: { maxRedirects?: number; timeoutMs?: number },
): Promise<{ status: number | undefined; body: string; url: string }>;
