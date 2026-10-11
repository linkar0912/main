// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const builder = vi.fn((_props: unknown) => <div>Builder</div>);
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("./automation-builder", () => ({ AutomationBuilder: (props: unknown) => builder(props) }));

const { AutomationEditorScreen } = await import("./automation-editor-screen");

describe("AutomationEditorScreen", () => {
  afterEach(() => {
    cleanup();
    builder.mockClear();
    vi.unstubAllGlobals();
  });

  it("rehydrates the saved Facebook Page and priority into the builder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          id: "automation_1",
          name: "Page support",
          provider: "FACEBOOK",
          facebookPageId: "page_1",
          instagramAccountId: null,
          priority: 8,
          definition: {
            version: 1,
            trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
            conditions: [],
            actions: [{ type: "private_reply", text: "Thanks" }],
          },
        },
      }),
    })));

    render(<AutomationEditorScreen automationId="automation_1" />);

    await waitFor(() => expect(builder).toHaveBeenCalledWith(expect.objectContaining({
      initialFacebookPageId: "page_1",
      initialPriority: 8,
    })));
  });

  it("says a deleted automation is gone and offers the way back, not a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "Automation not found" }) })));

    render(<AutomationEditorScreen automationId="automation_gone" />);

    expect((await screen.findByRole("alert")).textContent).toContain("This automation no longer exists");
    expect(screen.getAllByRole("link", { name: /back to automations/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("offers a retry when loading fails, and opens the builder once it works", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "Service temporarily unavailable" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: "automation_1",
            name: "Retry me",
            provider: "INSTAGRAM",
            instagramAccountId: "ig_1",
            priority: 0,
            definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hi" }] },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AutomationEditorScreen automationId="automation_1" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn’t be opened");
    expect(alert.textContent).not.toContain("deleted");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(builder).toHaveBeenCalledWith(expect.objectContaining({ initialName: "Retry me" })));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
