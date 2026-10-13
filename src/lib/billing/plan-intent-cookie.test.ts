import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import {
  clearPlanIntentCookie,
  planIntentCookieOptions,
  planIntentFromRequest,
  rememberPlanIntent,
  setPlanIntentCookie,
} from "./plan-intent-cookie";

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const production = { appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", publicSiteUrl: "https://linkar.in" };
const local = { appUrl: "http://localhost:3000", adminUrl: "http://localhost:3000", publicSiteUrl: "http://localhost:3000" };

function visit(path: string, method = "GET") {
  return { method, nextUrl: new URL(path, "https://app.linkar.in") };
}

function setCookie(response: NextResponse): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("plan intent cookie", () => {
  it("is HttpOnly, SameSite=Lax, Secure and shared with the parent domain in production", () => {
    expect(planIntentCookieOptions(production)).toEqual({ domain: "linkar.in", path: "/", httpOnly: true, secure: true, sameSite: "lax" });
    expect(planIntentCookieOptions(local)).toEqual({ path: "/", httpOnly: true, secure: false, sameSite: "lax" });
  });

  it("lives for 24 hours", () => {
    const header = setCookie(setPlanIntentCookie(NextResponse.next(), { plan: "growth", interval: "ANNUAL" }, production, NOW));
    expect(header).toContain(`linkar_plan_intent=growth.annual.${NOW / 1000}`);
    expect(header).toMatch(/Max-Age=86400/i);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Domain=linkar\.in/i);
  });

  it("is cleared on the same domain it was set on", () => {
    const header = setCookie(clearPlanIntentCookie(NextResponse.json({}), production));
    expect(header).toContain("linkar_plan_intent=;");
    expect(header).toMatch(/Max-Age=0/i);
    expect(header).toMatch(/Domain=linkar\.in/i);
  });

  it("is read back from the Cookie header, unexpired and valid only", () => {
    const at = (cookie: string) => new Request("https://app.linkar.in/api/workspace/bootstrap", { headers: { cookie } });
    expect(planIntentFromRequest(at(`sb=1; linkar_plan_intent=creator.monthly.${NOW / 1000}; other=2`), NOW))
      .toEqual({ plan: "creator", interval: "MONTHLY" });
    expect(planIntentFromRequest(at(`linkar_plan_intent=creator.monthly.${NOW / 1000 - 25 * 3600}`), NOW)).toBeNull();
    expect(planIntentFromRequest(at("linkar_plan_intent=free.monthly.1"), NOW)).toBeNull();
    expect(planIntentFromRequest(at("not_linkar_plan_intent=creator.monthly.1"), NOW)).toBeNull();
    expect(planIntentFromRequest(new Request("https://app.linkar.in/"), NOW)).toBeNull();
  });
});

describe("rememberPlanIntent (proxy)", () => {
  it("remembers a plan picked on /pricing when /signup or /login opens", () => {
    expect(setCookie(rememberPlanIntent(visit("/signup?plan=growth&interval=annual"), NextResponse.next(), production, NOW)))
      .toContain(`linkar_plan_intent=growth.annual.${NOW / 1000}`);
    expect(setCookie(rememberPlanIntent(visit("/login?plan=agency&interval=monthly&next=%2Fdashboard"), NextResponse.next(), production, NOW)))
      .toContain(`linkar_plan_intent=agency.monthly.${NOW / 1000}`);
  });

  it("drops any intent when the visitor is joining a workspace by invitation", () => {
    const header = setCookie(rememberPlanIntent(visit("/signup?plan=growth&interval=annual&invite=raw-token"), NextResponse.next(), production, NOW));
    expect(header).toContain("linkar_plan_intent=;");
    expect(header).toMatch(/Max-Age=0/i);
  });

  it("leaves the cookie alone without a valid plan, on other pages and on non-GET requests", () => {
    for (const request of [
      visit("/signup"),
      visit("/signup?plan=free&interval=monthly"),
      visit("/signup?plan=growth&interval=weekly"),
      visit("/pricing?plan=growth&interval=annual"),
      visit("/signup/extra?plan=growth"),
      visit("/signup?plan=growth", "POST"),
    ]) {
      expect(setCookie(rememberPlanIntent(request, NextResponse.next(), production, NOW))).toBe("");
    }
  });
});
