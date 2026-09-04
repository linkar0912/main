// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxWorkspace } from "./inbox-workspace";

describe("InboxWorkspace", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("switches between Instagram conversations and Facebook activity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [], members: [], items: [] } }), { status: 200 })));
    render(<InboxWorkspace />);
    expect(await screen.findByRole("region", { name: "Instagram inbox conversations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Facebook activity" }));
    expect(await screen.findByText(/Facebook Messenger is not enabled/i)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Facebook activity" }).getAttribute("aria-selected")).toBe("true");
  });
});
