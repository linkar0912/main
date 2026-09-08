// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstagramPreview } from "./instagram-preview";

describe("InstagramPreview", () => {
  it("renders template actions attached to their incoming message card", () => {
    render(
      <InstagramPreview
        view="dm"
        onViewChange={vi.fn()}
        username="creator"
        messages={[{
          id: "follow-prompt",
          from: "bot",
          text: "Follow me, then tap below.",
          actions: ["Visit Profile", "I'm following"],
        }]}
      />,
    );

    const card = screen.getByTestId("instagram-button-template");
    expect(within(card).getByText("Follow me, then tap below.")).toBeTruthy();
    expect(within(card).getByText("Visit Profile")).toBeTruthy();
    expect(within(card).getByText("I'm following")).toBeTruthy();
    expect(card.querySelectorAll(".ig-dm-template-action")).toHaveLength(2);
  });
});
