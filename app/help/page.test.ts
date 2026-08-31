import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HelpPage = (await import("./page")).default;
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("HelpPage", () => {
  it("renders HelpScreen with no server-resolved props", () => {
    const result = HelpPage();
    expect(result.type.name).toBe("HelpScreen");
    expect(result.props).toEqual({});
  });

  it("does no server work, so navigating to /help never waits on a request-time render", () => {
    // The page used to be force-dynamic purely so SUPPORT_EMAIL was read at
    // request time rather than frozen into the Docker image build. That cost
    // every navigation a full server round trip before anything painted.
    // supportEmail now travels on /api/workspace/bootstrap - still request-time,
    // still Coolify's value, but fetched once by the app shell - so the page can
    // be a plain static client page like /automations.
    expect(source).not.toMatch(/dynamic\s*=\s*["']force-dynamic["']/);
    expect(source).not.toMatch(/getServerEnv/);
    expect(source).not.toMatch(/\basync\b/);
  });
});
