// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicPageReplyVariants } from "./action-section";

describe("PublicPageReplyVariants", () => {
  it("identifies the last available reply slot before adding it", () => {
    const onChange = vi.fn();
    const variants = ["Reply two", "Reply three", "Reply four"];

    render(<PublicPageReplyVariants variants={variants} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add final reply variation" }));
    expect(onChange).toHaveBeenCalledWith([...variants, ""]);
  });
});
