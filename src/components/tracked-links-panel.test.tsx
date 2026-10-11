// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    cleanup();
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
      // Links are addressed by slug; the old id-based URL 404'd in production.
      if (url === "/api/links/summer-sale") {
        return jsonResponse({ data: { id: "link_1", slug: "summer-sale" } });
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
    expect(screen.getByText("9 people")).toBeTruthy();
    // Country names, not ISO codes.
    expect(screen.getByText(/Top countries: United States \(5\), India \(4\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Copy URL/i }));
    expect(clipboardWrite).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /Copied/i })).toBeTruthy();

    // Delete asks in place (no browser confirm box) and Cancel backs out.
    fireEvent.click(screen.getByRole("button", { name: "Delete /r/summer-sale" }));
    expect(screen.getByRole("group", { name: "Confirm deleting /r/summer-sale" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm deleting /r/summer-sale" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/links/summer-sale", { method: "DELETE" });

    fireEvent.click(screen.getByRole("button", { name: "Delete /r/summer-sale" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete link" }));
    await waitFor(() => expect(screen.queryByText("/r/summer-sale")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/links/summer-sale", { method: "DELETE" });
  });

  it("explains a missing name or destination next to the field instead of posting", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<TrackedLinksPanel />);
    await screen.findByText(/No tracked links yet/);

    fireEvent.click(screen.getByRole("button", { name: /New link/ }));
    fireEvent.change(screen.getByLabelText("Short link"), { target: { value: "summer sale!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));

    expect(screen.getByText("Use only letters, numbers and dashes.")).toBeTruthy();
    expect(screen.getByText("Add the page this link should open.")).toBeTruthy();
    expect(screen.getByLabelText("Short link").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

