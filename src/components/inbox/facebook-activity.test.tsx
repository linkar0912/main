// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FacebookActivity } from "./facebook-activity";

const first = { id: "fb_1", channel: "facebook", avatarUrl: "/avatar", type: "facebook.comment.created", label: "Facebook Page comment", at: "2026-09-04T10:00:00.000Z", account: "page_1", from: "Aanya", summary: "Guide please" };
const second = { ...first, id: "fb_2", account: "page_2", from: "Arjun", summary: "Pricing please" };

describe("FacebookActivity", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders public Page activity without messaging controls and paginates", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [first], nextCursor: "next" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [first, second] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<FacebookActivity />);

    expect(await screen.findByText("Guide please")).toBeTruthy();
    expect(screen.getByText(/Facebook Messenger is not enabled/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /send|reply/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more Facebook activity" }));
    expect(await screen.findByText("Pricing please")).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toContain("type=facebook.comment.created");
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=next");
  });
});
