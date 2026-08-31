// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
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
});
