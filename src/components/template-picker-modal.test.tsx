// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { basicAutomationTemplates } from "@/src/lib/automation/templates";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { TemplatePickerModal, TEMPLATE_EXAMPLES } = await import("./template-picker-modal");

describe("TemplatePickerModal", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
    vi.unstubAllGlobals();
  });

  it("switches to a connected Facebook Page and shows only compatible Page-comment recipes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ pageId: "page_1", pageName: "Linkar Demo", status: "CONNECTED" }] }),
    })));
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Facebook" }));
    const pageSelect = await screen.findByLabelText("Facebook Page");
    expect(screen.queryByText("Keyword comment reply")).toBeNull();
    fireEvent.change(pageSelect, { target: { value: "page_1" } });

    expect(await screen.findByText("Keyword comment reply")).toBeTruthy();
    expect(screen.queryByText(/Conversation Starters/)).toBeNull();
    fireEvent.click(screen.getByText("Keyword comment reply"));

    await waitFor(() => expect(push).toHaveBeenCalledWith(
      "/automations/new?type=classic&template=facebook-keyword-comment-reply&provider=facebook&surface=comment&connection=page_1",
    ));
  });

  it("carries the selected Facebook Page into a blank Page-comment builder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ pageId: "page_1", pageName: "Linkar Demo", status: "CONNECTED" }] }),
    })));
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Facebook" }));
    fireEvent.change(await screen.findByLabelText("Facebook Page"), { target: { value: "page_1" } });
    fireEvent.click(screen.getByText("Start from scratch"));

    expect(push).toHaveBeenCalledWith("/automations/new?type=classic&provider=facebook&surface=comment&connection=page_1");
  });

  it("lists the campaign quick-start and every premade recipe", () => {
    render(<TemplatePickerModal onClose={() => {}} />);

    expect(screen.getByText("Follow-gated Reel campaign")).toBeTruthy();
    expect(screen.getByText(/Say hi to new followers/)).toBeTruthy();
    expect(screen.getByText(/Conversation Starters/)).toBeTruthy();
    expect(screen.getByText(/Story Mention Reply/)).toBeTruthy();
    expect(screen.getByText(/Email Capture/)).toBeTruthy();
    expect(screen.getByText("Default Reply", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/Main Menu/)).toBeTruthy();
    // Template tiles carry no icons anymore.
    expect(document.querySelector(".template-picker-tile-icon")).toBeNull();
  });

  it("keeps every example line consistent with the recipe's real trigger", () => {
    // "Comment "guide" → DM asking for email" described a flow the builder
    // refuses to build: email capture is unavailable on comment triggers.
    for (const template of basicAutomationTemplates) {
      const example = TEMPLATE_EXAMPLES[template.id];
      expect(example, `${template.id} has no example line`).toBeTruthy();
      const triggerType = template.setup.definition.trigger.type;
      if (/^Comment\b/.test(example!)) {
        expect(triggerType, `${template.id} example says "Comment" but triggers on ${triggerType}`).toBe("comment");
      }
      if (/^DM\b/.test(example!)) {
        expect(triggerType, `${template.id} example says "DM" but triggers on ${triggerType}`).toBe("message");
      }
    }
  });

  it("quotes only keywords the recipe actually matches", () => {
    // The Conversation Starters line promised DM "hi" while the recipe matches
    // price/hours/delivery - the one keyword a curious user tries first misses.
    for (const template of basicAutomationTemplates) {
      const trigger = template.setup.definition.trigger;
      if (trigger.type !== "comment" && trigger.type !== "message") continue;
      if (trigger.match !== "keyword") continue;
      // Only the trigger half of the line names keywords; everything past the
      // first arrow is reply copy, which quotes whatever it likes.
      const triggerHalf = TEMPLATE_EXAMPLES[template.id]!.split("→")[0]!;
      const quoted = [...triggerHalf.matchAll(/[“"]([^”"]+)[”"]/g)].map((match) => match[1]!.toLowerCase());
      for (const word of quoted) {
        expect(
          trigger.keywords.some((keyword) => keyword.toLowerCase() === word),
          `${template.id} example quotes "${word}" but its keywords are ${trigger.keywords.join(", ")}`,
        ).toBe(true);
      }
    }
  });

  it("narrows to matching templates as you search", () => {
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Search templates"), { target: { value: "story" } });

    expect(screen.getByText(/Story Mention Reply/)).toBeTruthy();
    expect(screen.queryByText(/Email Capture/)).toBeNull();
    expect(screen.queryByText("Follow-gated Reel campaign")).toBeNull();
  });

  it("navigates to the builder with the template id when a recipe is chosen", () => {
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.click(screen.getByText(/Email Capture/));

    expect(push).toHaveBeenCalledWith(
      `/automations/new?type=classic&template=${basicAutomationTemplates.find((t) => t.id === "email-capture")?.id}`,
    );
  });

  it("navigates to a blank classic builder from Start from scratch", () => {
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.click(screen.getByText("Start from scratch"));

    expect(push).toHaveBeenCalledWith("/automations/new?type=classic");
  });

  it("navigates to the campaign builder from the quick-start card", () => {
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.click(screen.getByText("Follow-gated Reel campaign"));

    expect(push).toHaveBeenCalledWith("/automations/new?type=campaign");
  });

  it("filters to one category when a sidebar filter is picked", () => {
    render(<TemplatePickerModal onClose={() => {}} />);
    const categories = within(screen.getByLabelText("Template categories"));

    fireEvent.click(categories.getByText("Story mentions"));

    expect(screen.getByText(/Story Mention Reply/)).toBeTruthy();
    expect(screen.queryByText(/Email Capture/)).toBeNull();
    expect(screen.queryByText("Follow-gated Reel campaign")).toBeNull();

    fireEvent.click(categories.getByText("All templates"));
    expect(screen.getByText(/Email Capture/)).toBeTruthy();
  });

  it("groups the follow-gated campaign under Post & Reel comments, since that's its real trigger", () => {
    render(<TemplatePickerModal onClose={() => {}} />);
    const categories = within(screen.getByLabelText("Template categories"));

    fireEvent.click(categories.getByText("Post & Reel comments"));

    expect(screen.getByText("Follow-gated Reel campaign")).toBeTruthy();
    expect(screen.queryByText(/Email Capture/)).toBeNull();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<TemplatePickerModal onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
