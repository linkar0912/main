// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContextHelpLink } from "./context-help-link";

describe("ContextHelpLink", () => {
  afterEach(cleanup);

  it("links an accessible help label to the encoded topic", () => {
    render(<ContextHelpLink topic="email capture & contacts" />);

    const link = screen.getByRole("link", { name: "Need help?" });
    expect(link.getAttribute("href")).toBe("/help?topic=email+capture+%26+contacts");
  });
});
