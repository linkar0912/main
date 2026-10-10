// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxWorkspace } from "./inbox-workspace";

describe("InboxWorkspace", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("switches between Instagram DMs and Facebook comments", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [], members: [], items: [] } }), { status: 200 })));
    render(<InboxWorkspace />);
    expect(await screen.findByRole("region", { name: "Instagram inbox conversations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Facebook comments" }));
    expect(await screen.findByText(/Facebook Messenger is not enabled/i)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Facebook comments" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps one tab stop and moves between channels with the arrow keys", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [], members: [], items: [] } }), { status: 200 })));
    render(<InboxWorkspace />);
    const instagram = screen.getByRole("tab", { name: "Instagram DMs" });
    const facebook = screen.getByRole("tab", { name: "Facebook comments" });
    expect(instagram.getAttribute("tabindex")).toBe("0");
    expect(facebook.getAttribute("tabindex")).toBe("-1");

    instagram.focus();
    fireEvent.keyDown(instagram, { key: "ArrowRight" });
    expect(facebook.getAttribute("aria-selected")).toBe("true");
    expect(facebook.getAttribute("tabindex")).toBe("0");
    expect(instagram.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(facebook);
    expect(await screen.findByText(/Facebook Messenger is not enabled/i)).toBeTruthy();

    fireEvent.keyDown(facebook, { key: "ArrowRight" });
    expect(instagram.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(instagram);
    fireEvent.keyDown(instagram, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(facebook);
  });
});
