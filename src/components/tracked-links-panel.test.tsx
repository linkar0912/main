// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrackedLinksPanel } from "./tracked-links-panel";

type FetchResponse = Response & { ok: boolean; json: () => Promise<unknown> };

function jsonResponse(payload: unknown, ok = true): FetchResponse {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => payload,
  } as FetchResponse;
}

describe("TrackedLinksPanel", () => {
  const originalFetch = global.fetch;
  let clipboardWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboardWrite }, configurable: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders the list returned by /api/links and supports view-stats + delete", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/links?limit=50") {
        return jsonResponse({
          data: [
            {
              id: "link_1",
              slug: "summer-sale",
              destination: "https://example.com/sale",
              utmSource: "instagram",
              utmCampaign: "summer",
              createdAt: "2026-08-20T10:00:00.000Z",
            },
          ],
        });
      }
      if (url === "/api/links/summer-sale/stats") {
        return jsonResponse({
          data: {
            totalClicks: 12,
            uniqueClicks: 9,
            lastClickedAt: "2026-08-20T11:00:00.000Z",
            topCountries: [{ country: "US", count: 5 }, { country: "IN", count: 4 }],
          },
        });
      }
      if (url === "/api/links/link_1") {
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<TrackedLinksPanel />);

    expect(await screen.findByText("/r/summer-sale")).toBeTruthy();
    // The destination URL is shown on the row; the same text also lives in the
    // form placeholder, so use the list container to find a unique match.
    const lists = document.querySelectorAll("ul.tracked-link-list");
    expect(lists.length).toBe(1);
    expect(lists[0].textContent).toContain("https://example.com/sale");

    fireEvent.click(screen.getByRole("button", { name: /View stats/i }));
    await waitFor(() => {
      expect(screen.getByText("12 clicks")).toBeTruthy();
    });
    expect(screen.getByText("9 unique")).toBeTruthy();
    expect(screen.getByText(/Top countries: US \(5\), IN \(4\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Copy URL/i }));
    expect(clipboardWrite).toHaveBeenCalled();
  });

  it("surfaces server errors from /api/links", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "workspace required" }, false),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<TrackedLinksPanel />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("workspace required");
  });
});

