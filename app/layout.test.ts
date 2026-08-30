import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("root layout", () => {
  it("declares the global smooth-scroll behavior for Next.js route transitions", () => {
    expect(layout).toContain('data-scroll-behavior="smooth"');
  });
});
