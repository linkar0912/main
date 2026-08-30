import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("platform owner environment", () => {
  it("normalizes and deduplicates a comma-separated UUID allowlist", () => {
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", [
      "11111111-1111-4111-8111-111111111111",
      " 22222222-2222-4222-8222-222222222222 ",
      "11111111-1111-4111-8111-111111111111",
    ].join(","));

    expect(getServerEnv().platformOwnerUserIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("rejects email addresses and malformed identifiers", () => {
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "owner@linkar.in,not-a-uuid");

    expect(() => getServerEnv()).toThrow(
      "PLATFORM_OWNER_USER_IDS must contain UUIDs",
    );
  });

  it("fails closed when the production allowlist is empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PLATFORM_OWNER_USER_IDS", "");

    expect(() => getServerEnv()).toThrow(
      "PLATFORM_OWNER_USER_IDS is required in production",
    );
  });
});
