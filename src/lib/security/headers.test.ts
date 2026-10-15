import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getSeoPages, seoPagePath, seoPages } from "@/src/content/seo";
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

/**
 * The Content-Security-Policy a request for `path` receives. Next.js applies
 * every rule whose source matches, and the last one wins for a key. Every
 * rule after the catch-all is a literal path (checked below), and a literal
 * source matches with or without a trailing slash.
 */
function effectivePolicy(rules: ReturnType<typeof securityHeaderRules>, path: string): string {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  let policy = "";
  for (const rule of rules) {
    if (rule.source !== "/:path*" && rule.source !== normalized) continue;
    policy = rule.headers.find((entry) => entry.key === "Content-Security-Policy")?.value ?? policy;
  }
  return policy;
}

const ANALYTICS_HOSTS = /googletagmanager|google-analytics|analytics\.google|cloudflareinsights/;

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

  it("scopes the public-site policy with exact paths only", () => {
    const rules = securityHeaderRules(true);
    const scoped = rules.slice(1);
    for (const rule of scoped) {
      expect(rule.source, rule.source).toMatch(/^\/[a-z0-9/-]*$/);
      expect(rule.source.length === 1 || !rule.source.endsWith("/"), rule.source).toBe(true);
    }
    expect(scoped.map((rule) => rule.source)).toEqual([...ANALYTICS_PAGE_PATHS]);
  });

  it("allows Google Analytics on every SEO catalogue hub and guide, in dev and production", () => {
    const paths = ["/features", "/solutions", "/templates", ...seoPages.map(seoPagePath)];
    for (const production of [true, false]) {
      const rules = securityHeaderRules(production);
      for (const path of paths) {
        const csp = directives(effectivePolicy(rules, path));
        expect(csp.get("script-src"), path).toEqual(expect.arrayContaining(["https://www.googletagmanager.com", "https://static.cloudflareinsights.com"]));
        expect(csp.get("connect-src"), path).toEqual(expect.arrayContaining(["https://*.google-analytics.com", "https://cloudflareinsights.com"]));
      }
    }
    expect(directives(effectivePolicy(securityHeaderRules(true), "/features/instagram-comment-to-dm")).get("script-src"))
      .toContain("https://www.googletagmanager.com");
    expect(directives(effectivePolicy(securityHeaderRules(true), "/features/instagram-comment-to-dm/")).get("script-src"))
      .toContain("https://www.googletagmanager.com");
  });

  it("keeps the base policy on recipe downloads, unknown slugs and the app", () => {
    const rules = securityHeaderRules(true);
    const paths = [
      "/templates/comment-guide-delivery/recipe",
      ...getSeoPages("templates").map((page) => `${seoPagePath(page)}/recipe`),
      "/features/not-a-guide",
      "/solutions/not-a-guide",
      "/templates/not-a-guide",
      "/features/instagram-comment-to-dm/extra",
      "/llms.txt",
      "/sitemap.xml",
      "/dashboard",
      "/automations/auto_1",
      "/settings",
      "/admin",
      "/reset-password",
      "/data-deletion/status/abc123",
    ];
    for (const path of paths) {
      const policy = effectivePolicy(rules, path);
      expect(policy, path).toBe(contentSecurityPolicy({ production: true, publicSite: false }));
      expect(policy, path).not.toMatch(ANALYTICS_HOSTS);
    }
    expect(effectivePolicy(rules, "/templates/comment-guide-delivery/recipe")).not.toContain("https://www.googletagmanager.com");
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
