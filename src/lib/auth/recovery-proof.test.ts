import { describe, expect, it } from "vitest";
import { createRecoveryProof, readRecoveryProof, RECOVERY_PROOF_TTL_SECONDS } from "./recovery-proof";

const SECRET = "test-secret-at-least-32-characters";

describe("recovery proof", () => {
  it("round-trips the user id while fresh", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    expect(readRecoveryProof(createRecoveryProof("user_1", SECRET, now), SECRET, now)).toBe("user_1");
  });

  it("expires after fifteen minutes", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const later = new Date(now.getTime() + RECOVERY_PROOF_TTL_SECONDS * 1_000 + 1);
    expect(readRecoveryProof(createRecoveryProof("user_1", SECRET, now), SECRET, later)).toBeNull();
  });

  it("rejects a forged or re-signed proof", () => {
    const proof = createRecoveryProof("user_1", SECRET);
    const [, signature] = proof.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "user_2", exp: Date.now() + 60_000 })).toString("base64url");
    expect(readRecoveryProof(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
    expect(readRecoveryProof(proof, "another-secret-at-least-32-characters")).toBeNull();
    expect(readRecoveryProof(undefined, SECRET)).toBeNull();
    expect(readRecoveryProof("garbage", SECRET)).toBeNull();
  });
});
