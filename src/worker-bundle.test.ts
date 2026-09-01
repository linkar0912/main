import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production worker bundle", () => {
  it("does not include Next's throwing server-only fallback", () => {
    execFileSync("pnpm", ["build:worker"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    const bundle = readFileSync("dist/worker.js", "utf8");
    expect(
      bundle.includes(
        "This module cannot be imported from a Client Component module",
      ),
    ).toBe(false);
  });
});
