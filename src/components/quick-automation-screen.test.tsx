// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/quick-automation",
  useRouter: () => ({ push }),
}));

const { QuickAutomationScreen } = await import("./quick-automation-screen");

const reelOne = {
  id: "reel_1",
  caption: "Giveaway Reel",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/reel_1/",
  thumbnailUrl: "https://cdn.example/reel_1.jpg",
  timestamp: "2026-09-01T10:00:00.000Z",
};

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/workspace/bootstrap")) {
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }
    if (url === "/api/meta/media") {
      return new Response(JSON.stringify({
        data: [
          reelOne,
          { ...reelOne, id: "feed_1", caption: "Feed post", mediaProductType: "FEED" },
        ],
        paging: { after: "cursor_2" },
      }));
    }
    if (url === "/api/meta/media?after=cursor_2") {
      return new Response(JSON.stringify({
        data: [{ ...reelOne, id: "reel_2", caption: "Launch Reel" }],
        paging: {},
      }));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("QuickAutomationScreen", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
    vi.unstubAllGlobals();
  });

  it("shows Reels only, then reveals every compatible comment flow", async () => {
    stubFetch();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(<QuickAutomationScreen />);

    const reel = await screen.findByRole("button", { name: /select reel giveaway reel/i });
    expect(screen.queryByText("Feed post")).toBeNull();
    expect(screen.queryByRole("heading", { name: /choose what happens next/i })).toBeNull();

    fireEvent.click(reel);

    expect(screen.getByRole("heading", { name: /choose what happens next/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /send a link after someone follows you/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /send a link when someone comments/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /conversation starters/i })).toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("keeps the Quick Automation header free of a decorative icon", async () => {
    stubFetch();
    const { container } = render(<QuickAutomationScreen />);

    await screen.findByRole("heading", { name: "Pick a Reel. Put it to work." });
    expect(container.querySelector(".quick-automation-header svg")).toBeNull();
  });

  it("routes the selected Reel and flow into the existing builder", async () => {
    stubFetch();
    render(<QuickAutomationScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /select reel giveaway reel/i }));
    fireEvent.click(screen.getByRole("button", { name: /send a link when someone comments/i }));

    expect(push).toHaveBeenCalledWith(
      "/automations/new?type=classic&template=comment-link-dm&media=reel_1",
    );
  });

  it("loads every Reel page without losing the current selection", async () => {
    stubFetch();
    render(<QuickAutomationScreen />);

    const selected = await screen.findByRole("button", { name: /select reel giveaway reel/i });
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole("button", { name: /load more reels/i }));

    expect(await screen.findByRole("button", { name: /select reel launch reel/i })).toBeTruthy();
    await waitFor(() => expect(selected.getAttribute("aria-pressed")).toBe("true"));
  });
});
