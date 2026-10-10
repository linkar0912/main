// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceDataCache } from "@/src/lib/client/workspace-data";
import { FacebookActivity } from "./facebook-activity";

const first = { id: "fb_1", channel: "facebook", avatarUrl: "/avatar", type: "facebook.comment.created", label: "Facebook Page comment", at: "2026-09-04T10:00:00.000Z", account: "page_1", from: "Aanya", summary: "Guide please" };
const second = { ...first, id: "fb_2", account: "page_2", from: "Arjun", summary: "Pricing please" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Routes activity pages in order; connected Pages come from their own endpoint. */
function stubFetch(activity: Array<() => Response>, pages: unknown[] = []) {
  const queue = [...activity];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/facebook/connection")) return json({ data: pages });
    if (url.startsWith("/api/activity")) {
      const next = queue.shift();
      if (!next) throw new Error(`No activity response left for ${url}`);
      return next();
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FacebookActivity", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearWorkspaceDataCache(); });

  it("presents loading as a compact feed status", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(<FacebookActivity />);

    expect(screen.getByRole("heading", { name: "Page comments" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading Facebook activity" })).toBeTruthy();
  });

  it("renders public Page activity without messaging controls and paginates", async () => {
    const fetchMock = stubFetch([
      () => json({ data: { items: [first], nextCursor: "next" } }),
      () => json({ data: { items: [first, second] } }),
    ]);
    render(<FacebookActivity />);

    expect(await screen.findByText("Guide please")).toBeTruthy();
    expect(screen.getByText(/Facebook Messenger is not enabled/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /send|reply/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more Facebook activity" }));
    expect(await screen.findByText("Pricing please")).toBeTruthy();
    const activityCalls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/activity"));
    expect(activityCalls[1]).toContain("type=facebook.comment.created");
    expect(activityCalls[1]).toContain("cursor=next");
  });

  it("names Pages instead of showing Meta's numeric Page IDs", async () => {
    stubFetch(
      [() => json({ data: { items: [{ ...first, account: "111222333" }, { ...second, account: "444555666" }] } })],
      [
        { id: "fb_rec_1", pageId: "111222333", pageName: "Acme Co", status: "CONNECTED", connectedAt: "2026-08-01T00:00:00.000Z" },
        { id: "fb_rec_2", pageId: "444555666", pageName: "Acme Studio", status: "CONNECTED", connectedAt: "2026-08-01T00:00:00.000Z" },
      ],
    );
    render(<FacebookActivity />);

    expect(await screen.findByText("On Acme Co")).toBeTruthy();
    expect(screen.getByText("On Acme Studio")).toBeTruthy();
    const filter = screen.getByRole("combobox", { name: "Filter by Facebook Page" });
    expect(filter.textContent).toContain("Acme Co");
    expect(filter.textContent).not.toContain("111222333");
    expect(screen.queryByText(/111222333/)).toBeNull();
  });

  it("offers Try again when the first load fails, instead of claiming there are no comments", async () => {
    stubFetch([
      () => json({ error: "Could not load Facebook activity" }, 500),
      () => json({ data: { items: [first] } }),
    ]);
    render(<FacebookActivity />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/No Page comments yet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Guide please")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
