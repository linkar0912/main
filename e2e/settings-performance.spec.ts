import { expect, test, type Page } from "@playwright/test";

// A section click shows the section at once and pushes ?section= to the URL;
// wait for that navigation to land so a later click is not overtaken by it.
async function openSection(page: Page, name: RegExp, section: string) {
  await page.getByRole("button", { name }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]section=${section}$`));
}

test("workspace navigation only loads visible data and reuses warm resources", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) requests.push(`${url.pathname}${url.search}`);
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/workspace/bootstrap") return route.fulfill({ json: { data: { email: "owner@example.com", role: "OWNER", plan: "free", mode: "configured" } } });
    if (path === "/api/meta/connection") return route.fulfill({ json: { data: [{ id: "ig_1", igUserId: "ig_user_1", username: "linkar", status: "CONNECTED", connectedAt: "2026-09-01T00:00:00.000Z" }] } });
    if (path === "/api/meta/connection/health") return route.fulfill({ json: { data: [] } });
    if (path === "/api/facebook/connection" || path === "/api/facebook/connection/health") return route.fulfill({ json: { data: [] } });
    if (path === "/api/team/invitations") return route.fulfill({ json: { members: [], invitations: [] } });
    if (path === "/api/workspace/messaging") return route.fulfill({ json: { data: null } });
    if (path === "/api/billing") return route.fulfill({ json: { data: { catalog: [], canManage: true, billingConfigured: true, entitlementPlanKey: "free", deliveriesUsed: 0, subscription: null } } });
    if (path === "/api/account") return route.fulfill({ json: { data: { id: "user_1", email: "owner@example.com", workspaceId: "workspace_1", role: "OWNER", plan: "free", memberSince: "2026-09-01T00:00:00.000Z", emailVerified: true } } });
    if (path === "/api/automations") return route.fulfill({ json: { data: [] } });
    if (path === "/api/insights") return route.fulfill({ json: { timeseries: { participantsPerDay: [], sentPerDay: [] }, capturedEmails: 0, optedOut: 0 } });
    return route.fallback();
  });

  const count = (path: string) => requests.filter((request) => request === path).length;
  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Connections", exact: true })).toBeVisible();
  expect(count("/api/team/invitations")).toBe(0);
  expect(count("/api/workspace/messaging")).toBe(0);
  expect(count("/api/billing")).toBe(0);

  await openSection(page, /Policies/, "policies");
  await expect(page.getByRole("region", { name: "Policies and support" })).toBeVisible();
  expect(count("/api/team/invitations")).toBe(0);
  expect(count("/api/workspace/messaging")).toBe(0);
  expect(count("/api/billing")).toBe(0);

  const healthRequests = count("/api/meta/connection/health") + count("/api/facebook/connection/health");
  await openSection(page, /Team/, "team");
  await expect(page.getByRole("region", { name: "Invite a teammate" }).getByLabel("Email address")).toBeVisible();
  expect(count("/api/team/invitations")).toBe(1);
  expect(count("/api/meta/connection/health") + count("/api/facebook/connection/health")).toBe(healthRequests);

  await openSection(page, /Billing/, "billing");
  await expect(page.getByRole("heading", { name: "Plan and usage" })).toBeVisible();
  expect(count("/api/billing")).toBe(1);
  await openSection(page, /Team/, "team");
  await openSection(page, /Billing/, "billing");
  await expect(page.getByRole("heading", { name: "Plan and usage" })).toBeVisible();
  expect(count("/api/billing")).toBe(1);

  // My profile now lives in the account menu (avatar button in the top bar).
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My profile" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Home" }).click();
  // Home greets by first name when it can derive one, otherwise "Welcome back".
  await expect(page.getByRole("heading", { level: 1, name: /^(Hello,|Welcome back)/ })).toBeVisible();
  expect(count("/api/meta/connection")).toBe(1);
  expect(count("/api/facebook/connection")).toBe(1);
  expect(count("/api/insights?include=overview")).toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(50);
  expect(count("/api/meta/connection")).toBe(1);
  expect(count("/api/insights?include=overview")).toBe(1);
});
