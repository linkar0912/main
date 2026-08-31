// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafetyLedger } from "./safety-ledger";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SafetyLedger", () => {
  it("pairs each platform constraint with the behaviour Linkar actually implements", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SafetyLedger />);

    const section = screen.getByRole("region", { name: "Inside Meta's rules, by design." });
    expect(section.id).toBe("safety");

    const terms = Array.from(section.querySelectorAll("dt"), (term) => term.textContent?.trim());
    expect(terms).toEqual([
      "Official interfaces only",
      "Meta's 24-hour messaging window",
      "Opt-outs are absolute",
      "Stored credentials",
      "Incoming webhooks",
      "Repeat events",
      "Workspace isolation",
    ]);
    // Every rule needs its answer; a ledger with an empty column is worse than
    // no ledger.
    expect(section.querySelectorAll("dd")).toHaveLength(terms.length);
    expect(Array.from(section.querySelectorAll("dd")).every((d) => (d.textContent ?? "").trim().length > 30)).toBe(true);
  });

  it("states the opt-out and window rules precisely, since both are claims about the platform", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SafetyLedger />);
    const section = screen.getByRole("region", { name: "Inside Meta's rules, by design." });

    // OPT_OUT_COMMANDS matches the whole message, so "stop" in a sentence is an
    // ordinary message - the copy has to say that rather than overclaiming.
    const optOut = within(section).getByText(/suppresses that person across the whole workspace/i);
    expect(optOut.textContent).toMatch(/exactly STOP, UNSUBSCRIBE, or REMOVE ME/);
    expect(optOut.textContent).toMatch(/not a setting you can switch off/i);

    // followup-runner skips with WINDOW_CLOSED rather than attempting a send.
    expect(within(section).getByText(/skipped and recorded as skipped - never forced through/i)).toBeTruthy();
  });

  it("carries no calls to action, so it reads as reference rather than another pitch", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SafetyLedger />);
    const section = screen.getByRole("region", { name: "Inside Meta's rules, by design." });

    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
  });

  it("unsticks the heading and keeps one column when motion or width is constrained", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/safety-ledger.module.css"), "utf8");

    const reducedMotion = stylesheet.slice(stylesheet.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain("position: static");

    const mobile = stylesheet.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)?.[1];
    expect(mobile).toContain("grid-template-columns: 1fr;");
    expect(mobile).toContain("position: static");
  });
});
