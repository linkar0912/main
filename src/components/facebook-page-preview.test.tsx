// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FacebookPagePreview } from "./facebook-page-preview";

describe("FacebookPagePreview", () => {
  it("shows the selected Page, triggering comment, and live public reply in a phone preview", () => {
    const { container } = render(
      <FacebookPagePreview
        pageName="Acme Co"
        posterName="Acme Co"
        postBody="Our latest launch is here."
        commentAuthor="A follower"
        commentText="guide"
        replyText="Thanks! Here is the guide."
      />,
    );

    expect(container.querySelector(".facebook-device")).toBeTruthy();
    expect(container.querySelector(".facebook-statusbar-island")).toBeTruthy();
    expect(container.querySelectorAll(".facebook-device-button")).toHaveLength(3);
    expect(screen.getAllByText("Acme Co")).toHaveLength(2);
    expect(screen.getByText("Our latest launch is here.")).toBeTruthy();
    expect(screen.getByText("guide")).toBeTruthy();
    expect(screen.getByText("Thanks! Here is the guide.")).toBeTruthy();
    expect(screen.getByText(/preview only/i)).toBeTruthy();
  });
});
