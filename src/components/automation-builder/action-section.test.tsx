// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filledReplyCount, PublicPageReplyVariants, ReplyVarietyHint } from "./action-section";

// En and em dashes, built from char codes so the branding check never sees the characters in source.
const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const VARIETY_HINT = /add 3 to 5 different wordings/i;

describe("PublicPageReplyVariants", () => {
  afterEach(cleanup);

  it("identifies the last available reply slot before adding it", () => {
    const onChange = vi.fn();
    const variants = ["Reply two", "Reply three", "Reply four"];

    render(<PublicPageReplyVariants firstReply="Reply one" variants={variants} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a final version" }));
    expect(onChange).toHaveBeenCalledWith([...variants, ""]);
  });

  it("suggests more wordings while only the first reply is written, without blocking another version", () => {
    const onChange = vi.fn();

    render(<PublicPageReplyVariants firstReply="Thanks for asking." variants={[]} onChange={onChange} />);

    expect(screen.getByRole("note").textContent).toMatch(VARIETY_HINT);
    fireEvent.click(screen.getByRole("button", { name: "Add another version" }));
    expect(onChange).toHaveBeenCalledWith([""]);
  });

  it("counts an empty extra slot as not written yet", () => {
    render(<PublicPageReplyVariants firstReply="Thanks for asking." variants={["   "]} onChange={vi.fn()} />);

    expect(screen.getByText(VARIETY_HINT)).toBeTruthy();
  });

  it("drops the suggestion once a second wording is written", () => {
    render(<PublicPageReplyVariants firstReply="Thanks for asking." variants={["Happy to help."]} onChange={vi.fn()} />);

    expect(screen.queryByText(VARIETY_HINT)).toBeNull();
  });
});

describe("ReplyVarietyHint", () => {
  afterEach(cleanup);

  it("stays quiet before any reply is written", () => {
    render(<ReplyVarietyHint replies={["", "  "]} />);

    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows for exactly one written reply and hides for two or more", () => {
    const { rerender } = render(<ReplyVarietyHint replies={["Check your DMs", ""]} />);
    expect(screen.getByRole("note").textContent).toMatch(VARIETY_HINT);

    rerender(<ReplyVarietyHint replies={["Check your DMs", "Sent you a message"]} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("uses plain wording with no dashes standing in for punctuation", () => {
    render(<ReplyVarietyHint replies={["Check your DMs"]} />);

    expect(screen.getByRole("note").textContent).not.toMatch(LONG_DASHES);
  });
});

describe("filledReplyCount", () => {
  it("ignores blank and whitespace-only replies", () => {
    expect(filledReplyCount([])).toBe(0);
    expect(filledReplyCount(["", " ", "\n"])).toBe(0);
    expect(filledReplyCount(["One", " ", "Two "])).toBe(2);
  });
});
