// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { basicAutomationTemplates } from "@/src/lib/automation/templates";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { TemplatePickerModal } = await import("./template-picker-modal");

describe("TemplatePickerModal", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
    vi.unstubAllGlobals();
  });

  it("presents each channel as a branded, accessible workflow context", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ pageId: "page_1", pageName: "Linkar Demo", status: "CONNECTED" }] }),
    })));
    render(<TemplatePickerModal onClose={() => {}} />);

    const runway = screen.getByLabelText("Automation channel");
    const instagram = within(runway).getByRole("button", { name: "Instagram" });
    const facebook = within(runway).getByRole("button", { name: "Facebook" });

    expect(instagram.getAttribute("aria-pressed")).toBe("true");
    expect(facebook.getAttribute("aria-pressed")).toBe("false");
    expect(runway.querySelector('[data-brand-logo="instagram"]')).toBeTruthy();
    expect(runway.querySelector('[data-brand-logo="facebook"]')).toBeTruthy();
    expect(runway.querySelector(".template-channel-surface-icon")).toBeNull();
    expect(within(runway).getByText("Works with")).toBeTruthy();
    expect(within(runway).getByText("Comments & messages")).toBeTruthy();

    fireEvent.click(facebook);

    expect(instagram.getAttribute("aria-pressed")).toBe("false");
    expect(facebook.getAttribute("aria-pressed")).toBe("true");
    expect(await within(runway).findByText("Connected Page")).toBeTruthy();
    expect(runway.querySelector(".template-channel-select-chevron")).toBeTruthy();
    expect(within(runway).getByText("Page comments")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Template results" })).toBeTruthy();
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

    expect(screen.getByText("Send a link after someone follows you")).toBeTruthy();
    expect(screen.getByText(/Say hi to new followers/)).toBeTruthy();
    expect(screen.getByText(/Conversation Starters/)).toBeTruthy();
    expect(screen.getByText(/Thank people who mention you in a Story/)).toBeTruthy();
    expect(screen.getByText(/Email Capture/)).toBeTruthy();
    expect(screen.getByText("Reply to every new message", { selector: "strong" })).toBeTruthy();
    expect(screen.getAllByText("How it works").length).toBeGreaterThan(0);
    expect(document.querySelector(".template-picker")?.textContent).not.toContain("→");
    expect(screen.getByText(/Main Menu/)).toBeTruthy();
    // Template tiles carry no icons anymore.
    expect(document.querySelector(".template-picker-tile-icon")).toBeNull();
  });

  it("narrows to matching templates as you search", () => {
    render(<TemplatePickerModal onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Search templates"), { target: { value: "story" } });

    expect(screen.getByText(/Thank people who mention you in a Story/)).toBeTruthy();
    expect(screen.queryByText(/Email Capture/)).toBeNull();
    expect(screen.queryByText("Send a link after someone follows you")).toBeNull();
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

    fireEvent.click(screen.getByText("Send a link after someone follows you"));

    expect(push).toHaveBeenCalledWith("/automations/new?type=campaign");
  });

  it("filters to one category when a sidebar filter is picked", () => {
    render(<TemplatePickerModal onClose={() => {}} />);
    const categories = within(screen.getByLabelText("Template categories"));

    fireEvent.click(categories.getByText("Story mentions"));

    expect(screen.getByText(/Thank people who mention you in a Story/)).toBeTruthy();
    expect(screen.queryByText(/Email Capture/)).toBeNull();
    expect(screen.queryByText("Send a link after someone follows you")).toBeNull();

    fireEvent.click(categories.getByText("All templates"));
    expect(screen.getByText(/Email Capture/)).toBeTruthy();
  });

  it("groups the follow-gated campaign under Post & Reel comments, since that's its real trigger", () => {
    render(<TemplatePickerModal onClose={() => {}} />);
    const categories = within(screen.getByLabelText("Template categories"));

    fireEvent.click(categories.getByText("Post & Reel comments"));

    expect(screen.getByText("Send a link after someone follows you")).toBeTruthy();
    expect(screen.queryByText(/Email Capture/)).toBeNull();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<TemplatePickerModal onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
