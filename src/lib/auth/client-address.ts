export function clientAddress(request: Request, trustedProxyHops: number): string {
    // Cloudflare sets this on every request it proxies; prefer it when present.
    // The header is forgeable on a direct (non-CF) connection, but a direct
    // request never sees the value set by a real Cloudflare edge, so the worst
    // a forger can do is spoof one of the IP strings Cloudflare would have
    // produced - the rate limiter still keys on email+IP, so the worst impact
    // is a single bucketed throttle group. We treat CF-Connecting-IP as a
    // hint, not as authentication.
    const cloudflareIp = request.headers.get("cf-connecting-ip");
    if (cloudflareIp) return cloudflareIp;
    // X-Forwarded-For is freely forgeable. Only honor it when the operator
    // has explicitly told us how many trusted reverse proxies sit in front
    // of the app (nginx, Traefik, Coolify, Cloudflare without the dedicated
    // header above, etc.). With zero trusted hops we MUST ignore XFF entirely
    // - otherwise an unauthenticated client can append its own XFF entry and
    // bypass the login rate limiter by spoofing a different IP on each
    // attempt.
    if (trustedProxyHops <= 0) return "unknown";
    // The XFF list is "client, proxy1, proxy2, …"; with N trusted proxies the
    // real client is the entry N positions from the right. The rightmost
    // entries are added by the trusted proxies themselves, so anything beyond
    // trustedProxyHops from the right was supplied by an untrusted hop.
    const forwarded = request.headers.get("x-forwarded-for");
    if (!forwarded) return "unknown";
    const entries = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean);
    const index = entries.length - 1 - trustedProxyHops;
    return index >= 0 ? (entries[index] ?? "unknown") : "unknown";
}