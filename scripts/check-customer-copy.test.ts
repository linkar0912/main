import { describe, expect, it } from "vitest";
// @ts-expect-error The production scanner is an executable ESM script.
import { findViolationsInSource, shouldScanCustomerFile } from "./check-customer-copy.mjs";

describe("customer copy guard", () => {
  it.each(["automation surface", "payload", "recipient", "webhook"])("rejects %s in customer JSX", (term) => {
    const source = `export function Card() { return <p>Check the ${term} here.</p>; }`;
    expect(findViolationsInSource(source, "src/components/card.tsx")).toEqual([
      expect.objectContaining({ term, file: "src/components/card.tsx" }),
    ]);
  });

  it("does not treat implementation identifiers and API paths as customer copy", () => {
    const source = `const payload = await fetch("/api/webhook"); export function Card() { return <p>Ready to reply.</p>; }`;
    expect(findViolationsInSource(source, "src/components/card.tsx")).toEqual([]);
  });

  it.each([
    "src/components/admin/system-health.tsx",
    "app/api/meta/webhook/route.ts",
    "src/components/card.test.tsx",
    "app/terms/page.tsx",
    "app/privacy/page.tsx",
  ])("allows technical language in %s", (file) => {
    expect(shouldScanCustomerFile(file)).toBe(false);
  });
});
