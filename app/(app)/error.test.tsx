// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceError from "./error";
import GlobalError from "../global-error";

describe("workspace error boundaries", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a friendly message inside the shell and retries the segment", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const retry = vi.fn();
    render(<WorkspaceError error={Object.assign(new Error("boom"), { digest: "abc123" })} retry={retry} />);

    expect(screen.getByRole("heading", { name: "This page could not load" })).toBeTruthy();
    // No raw error text for customers; the digest is there for support.
    expect(screen.queryByText("boom")).toBeNull();
    expect(screen.getByText(/abc123/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Home" }).getAttribute("href")).toBe("/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps a last-resort retry for errors in the root layout", () => {
    // global-error replaces the whole document, so it must bring its own
    // <html>/<body> and cannot rely on globals.css.
    const source = readFileSync(join(process.cwd(), "app/global-error.tsx"), "utf8");
    expect(typeof GlobalError).toBe("function");
    expect(source).toMatch(/^"use client";/);
    expect(source).toContain("<html");
    expect(source).toContain("<body>");
    expect(source).toContain("retry()");
  });
});
