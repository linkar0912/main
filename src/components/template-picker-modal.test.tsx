// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { basicAutomationTemplates } from "@/src/lib/automation/templates";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { TemplatePickerModal } = await import("./template-picker-modal");

describe("TemplatePickerModal", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
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
