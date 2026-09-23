export function clientAddress(request: Request, trustedProxyHops: number): string {
    // Cloudflare sets this on every request it proxies. The header is forgeable
    // on a direct (non-CF) connection, so only honor it when the operator has
    // told us a trusted reverse proxy sits in front of the app - the same gate
    // X-Forwarded-For gets below. With zero trusted hops a forger could
    // otherwise pick a fresh cf-connecting-ip per attempt and partition the
    // rate limiter at will.
    const cloudflareIp = request.headers.get("cf-connecting-ip");
    if (cloudflareIp && trustedProxyHops > 0) return cloudflareIp;
    // X-Forwarded-For is freely forgeable. Only honor it when the operator
    // has explicitly told us how many trusted reverse proxies sit in front
    // of the app (nginx, Traefik, Cloudflare without the dedicated
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
