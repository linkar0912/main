import { expect, test } from "@playwright/test";

const aanya = {
  id: "contact_1", username: "aanya", avatarUrl: "/api/contacts/contact_1/avatar", preview: "Need the guide",
  lastMessageAt: "2026-09-04T10:00:00.000Z", canMessage: true, unread: true, leadStatus: "ENGAGED", tags: ["guide"],
  inboxStatus: "OPEN", favorite: false,
};
const arjun = { ...aanya, id: "contact_2", username: "arjun", preview: "Pricing", unread: false };

test("Inbox paginates conversations and supports operational state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const patches: unknown[] = [];
  const inboxRequests: string[] = [];
  await page.route("**/api/inbox**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/inbox") {
      inboxRequests.push(url.toString());
      if (url.searchParams.get("cursor")) return route.fulfill({ json: { data: { contacts: [aanya, arjun], members: [] } } });
      return route.fulfill({ json: { data: { contacts: [aanya], members: [{ userId: "member_1", email: "owner@example.com", role: "OWNER" }], nextCursor: "page_2" } } });
    }
    if (url.pathname === "/api/inbox/contact_1" && request.method() === "PATCH") {
      patches.push(request.postDataJSON());
      return route.fulfill({ json: { data: { contact: aanya } } });
    }
    if (url.pathname === "/api/inbox/contact_1" && url.searchParams.get("cursor")) {
      return route.fulfill({ json: { data: { messages: [{ id: "message_1", direction: "inbound", text: "Oldest message", at: "2026-09-03T10:00:00.000Z", status: "received" }] } } });
    }
    return route.fulfill({ json: { data: { messages: [{ id: "message_2", direction: "inbound", text: "Newest message", at: "2026-09-04T10:00:00.000Z", status: "received" }], nextCursor: "older" } } });
  });

  await page.goto("/activity");
  await expect(page.getByRole("button", { name: /open conversation with @aanya/i })).toBeVisible();
  await page.getByRole("button", { name: "Load more conversations" }).click();
  await expect(page.getByRole("button", { name: /open conversation with @arjun/i })).toBeVisible();

  await page.getByRole("button", { name: /open conversation with @aanya/i }).click();
  await expect(page.getByText("Newest message")).toBeVisible();
  await expect.poll(() => patches).toContainEqual({ action: "mark_read" });
  await page.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(page.getByText("Oldest message")).toBeVisible();
  await page.getByRole("button", { name: "Add to favourites" }).click();
  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect.poll(() => patches).toContainEqual({ action: "set_favorite", favorite: true });
  await expect.poll(() => patches).toContainEqual({ action: "set_status", status: "CLOSED" });
  await expect(page.getByLabel(/attach|image|note/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Back to contacts" }).click();
  await page.getByLabel("Conversation status").selectOption("closed");
  await expect.poll(() => inboxRequests.some((url) => url.includes("status=closed"))).toBe(true);
});

test("Facebook activity is paginated and never exposes a Messenger composer", async ({ page }) => {
  await page.route("**/api/inbox", (route) => route.fulfill({ json: { data: { contacts: [], members: [] } } }));
  await page.route("**/api/activity?**", (route) => {
    const url = new URL(route.request().url());
    const first = { id: "fb_1", channel: "facebook", type: "facebook.comment.created", label: "Facebook Page comment", at: "2026-09-04T10:00:00.000Z", account: "page_1", from: "Aanya", summary: "Guide please" };
    const second = { ...first, id: "fb_2", from: "Arjun", summary: "Pricing please" };
    return route.fulfill({ json: { data: url.searchParams.get("cursor") ? { items: [first, second] } : { items: [first], nextCursor: "next" } } });
  });

  await page.goto("/activity");
  await page.getByRole("tab", { name: "Facebook activity" }).click();
  await expect(page.getByText("Guide please")).toBeVisible();
  await expect(page.getByText(/Facebook Messenger is not enabled/i)).toBeVisible();
  await page.getByRole("button", { name: "Load more Facebook activity" }).click();
  await expect(page.getByText("Pricing please")).toBeVisible();
  await expect(page.getByRole("button", { name: /send|reply/i })).toHaveCount(0);
});
