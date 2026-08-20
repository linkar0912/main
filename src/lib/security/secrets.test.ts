import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sealSecret, unsealSecret } from "./secrets";

describe("secret storage", () => {
  it("seals and unseals a token with a 32-byte key", () => {
    const key = randomBytes(32).toString("hex");
    const sealed = sealSecret("instagram-token", key);
    expect(sealed).not.toContain("instagram-token");
    expect(unsealSecret(sealed, key)).toBe("instagram-token");
  });

  it("rejects an invalid encryption key", () => {
    expect(() => sealSecret("token", "short")).toThrow("32-byte encryption key");
  });
});
