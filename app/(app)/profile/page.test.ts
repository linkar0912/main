import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ProfilePage = (await import("./page")).default;
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("ProfilePage", () => {
  it("renders ProfileScreen with no server-resolved props", () => {
    const result = ProfilePage();
    expect(result.type.name).toBe("ProfileScreen");
    expect(result.props).toEqual({});
  });

  it("does no server work, so /profile paints as fast as /automations", () => {
    // The page used to await getValidatedSession(), supabase.auth.getUser(), and
    // getMemberRole() before returning any HTML, which parked every navigation
    // to /profile on the loading skeleton for a server round trip plus two
    // network calls. ProfileScreen now reads email/role/plan from the shell
    // bootstrap the sidebar already fetched and pulls memberSince/emailVerified
    // from /api/account. Proxy still gates the route (see proxy.ts), so dropping
    // the in-page redirect does not open it up.
    expect(source).not.toMatch(/dynamic\s*=\s*["']force-dynamic["']/);
    // Matched against imports, not prose: the comment in page.tsx names the
    // calls it removed, and that mention is the point of the comment.
    const imports = source.match(/^import .*$/gm)?.join("\n") ?? "";
    expect(imports).not.toMatch(/auth\/session|supabase\/server|repository-provider/);
    expect(source).not.toMatch(/^\s*(export default )?async function/m);
  });
});
