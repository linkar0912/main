import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
const { expiryBucket } = await import("./repository");
describe("integration health derivation", () => { const now = new Date("2026-08-31T10:00:00.000Z"); it("classifies bounded token expiry windows without token material", () => { expect(expiryBucket(new Date("2026-09-05T10:00:00.000Z"), now)).toBe("within_7_days"); expect(expiryBucket(new Date("2026-08-30T10:00:00.000Z"), now)).toBe("expired"); expect(expiryBucket(null, now)).toBe("unknown"); }); });
