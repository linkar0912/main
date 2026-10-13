import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYTICS_PAGE_PATHS } from "../analytics-path";
import { contentSecurityPolicy, securityHeaderRules, securityHeaders } from "./headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split(";").map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
}

function header(rules: ReturnType<typeof securityHeaderRules>, source: string, key: string): string | undefined {
  return rules.find((rule) => rule.source === source)?.headers.find((entry) => entry.key === key)?.value;
}

describe("security headers", () => {
  it("sends the full set on every response", () => {
    const keys = securityHeaders(true).map((entry) => entry.key);
    expect(keys).toEqual(expect.arrayContaining([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]));
    expect(securityHeaderRules(true)[0].source).toBe("/:path*");
  });

  it("is HSTS preload-ready", () => {
    const hsts = securityHeaders(true).find((entry) => entry.key === "Strict-Transport-Security")?.value ?? "";
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1])).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("forbids framing, plugins and foreign form targets", () => {
    const csp = directives(contentSecurityPolicy({ production: true, publicSite: false }));
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
    expect(directives(contentSecurityPolicy({ production: false, publicSite: false })).get("script-src")).toContain("'unsafe-eval'");
  });

  it("lets Razorpay Checkout load on every page, so billing works after client-side navigation", () => {
    for (const publicSite of [false, true]) {
      const csp = directives(contentSecurityPolicy({ production: true, publicSite }));
      expect(csp.get("script-src")).toContain("https://checkout.razorpay.com");
      expect(csp.get("frame-src")).toContain("https://api.razorpay.com");
    }
    expect(securityHeaders(true).find((entry) => entry.key === "Cross-Origin-Opener-Policy")?.value).toBe("same-origin-allow-popups");
  });

  it("allows Google Analytics and the Cloudflare beacon on the public website pages only", () => {
    const rules = securityHeaderRules(true);
    const app = directives(header(rules, "/:path*", "Content-Security-Policy") ?? "");
    expect(app.get("script-src")?.some((source) => /googletagmanager|cloudflareinsights/.test(source))).toBe(false);
    expect(app.get("connect-src")?.some((source) => /google|cloudflareinsights/.test(source))).toBe(false);

    for (const path of ANALYTICS_PAGE_PATHS) {
      const site = directives(header(rules, path, "Content-Security-Policy") ?? "");
      expect(site.get("script-src")).toEqual(expect.arrayContaining(["https://www.googletagmanager.com", "https://static.cloudflareinsights.com"]));
      expect(site.get("connect-src")).toEqual(expect.arrayContaining([
        "https://*.google-analytics.com",
        "https://*.analytics.google.com",
        "https://*.googletagmanager.com",
        "https://www.google.com",
        "https://cloudflareinsights.com",
      ]));
      expect(site.get("img-src")).toEqual(expect.arrayContaining(["https://*.google-analytics.com", "https://*.googletagmanager.com"]));
    }
  });
});

describe("runtime image", () => {
  // `next start` loads next.config.ts in the container, so everything it
  // imports must be copied into the runtime stage or the server fails to boot.
  it("copies every module next.config.ts imports", () => {
    const root = resolve(__dirname, "../../..");
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    const runtime = dockerfile.slice(dockerfile.indexOf("AS runtime"));
    const pending = ["next.config.ts"];
    const seen = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(join(root, file), "utf8");
      for (const [, specifier] of source.matchAll(/^import[^"']*["'](\.[^"']+)["']/gm)) {
        pending.push(relative(root, resolve(root, dirname(file), `${specifier}.ts`)));
      }
    }
    for (const file of seen) {
      expect(runtime, `${file} is imported by next.config.ts`).toContain(`/app/${file}`);
    }
  });
});
