import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ supportEmail: "support@example.com" }) }));

const HelpPage = (await import("./page")).default;
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("HelpPage", () => {
  it("renders HelpScreen with the configured support email", () => {
    const result = HelpPage();
    expect(result.type.name).toBe("HelpScreen");
    expect(result.props).toEqual({ supportEmail: "support@example.com" });
  });

  it("stays force-dynamic so supportEmail is read at request time, not baked in at image build time", () => {
    // Without this, the page becomes eligible for full static generation and
    // supportEmail gets frozen into the build (where the real production
    // SUPPORT_EMAIL isn't set) instead of reflecting Coolify's runtime value -
    // the same reason /privacy, /terms, /support, and /data-deletion all keep it too.
    expect(source).toMatch(/dynamic\s*=\s*["']force-dynamic["']/);
  });
});
