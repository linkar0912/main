// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "./activity-feed";

describe("ActivityFeed", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders Facebook Page comment activity as a supported social event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "event_1",
        type: "facebook.comment.created",
        label: "Facebook Page comment",
        at: new Date().toISOString(),
        from: "Taylor",
        summary: "Interested",
      }],
    }), { status: 200 })));

    render(<ActivityFeed />);

    await waitFor(() => expect(screen.getByRole("region", { name: "Recent social activity" })).toBeTruthy());
    expect(screen.getByText("Facebook Page comment")).toBeTruthy();
    expect(screen.getByText("Taylor")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Facebook comments" })).toBeTruthy();
  });
});
