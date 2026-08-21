export function clientAddress(request: Request, trustedProxyHops: number): string {
    // Cloudflare sets this on every request it proxies; prefer it when present.
    const cloudflareIp = request.headers.get("cf-connecting-ip");
    if (cloudflareIp) return cloudflareIp;
    // Behind other proxies (nginx, Traefik, Coolify), take the client entry from
    // X-Forwarded-For: the list is "client, proxy1, proxy2, …", so with N trusted
    // proxies the client is the entry N positions from the right. With the default
    // of 0 trusted proxies this is the rightmost entry (set by the nearest proxy).
    const forwarded = request.headers.get("x-forwarded-for");
    if (!forwarded) return "unknown";
    const entries = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean);
    return entries[entries.length - 1 - trustedProxyHops] ?? "unknown";
}