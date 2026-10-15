import { describe, expect, it } from "vitest";
import {
  ACCOUNT_RECOVERING_REASON,
  ACCOUNT_THROTTLED_REASON,
  META_ERROR_REASONS,
  META_RATE_LIMIT_CODES,
  accountPausedReason,
  accountSendHeldReason,
  classifyMetaError,
  describeMetaError,
  isMetaAccountBlock,
  isMetaRateLimit,
  parseAccountPauseReason,
  parseMetaUsageHeaders,
} from "./errors";

const BLOCKED_2022 = "(#2022) The business has been blocked from sending messages via the IG Messaging API";

describe("Meta account-level blocks", () => {
  it.each([
    ["code 368", { status: 400, code: 368, message: "The action attempted has been deemed abusive or is otherwise disallowed" }],
    ["code 368 with a subcode", { status: 400, code: 368, subcode: 1390008 }],
    ["code 2022", { status: 400, code: 2022 }],
    ["#2022 as the subcode", { status: 400, code: 10, subcode: 2022 }],
    ["#2022 only in the text, under a permission code", { status: 400, code: 10, message: BLOCKED_2022 }],
    ["#2022 only in the text, under a 403", { status: 403, message: BLOCKED_2022 }],
    ["#2022 only in the text, with no code", { status: 400, message: BLOCKED_2022 }],
    ["#368 only in the text", { status: 400, code: 100, message: "(#368) Temporarily blocked for policies violations" }],
    ["the wording without a number", { status: 400, message: "This business has been blocked from sending messages." }],
  ])("recognises %s as an account block, not a generic rejection", (_label, details) => {
    expect(isMetaAccountBlock(details)).toBe(true);
    expect(classifyMetaError(details)).toBe("account_blocked");
    expect(describeMetaError(details)).toBe(META_ERROR_REASONS.accountBlocked);
  });

  it("recognises the stable reason MetaApiError stores in place of Meta's text", () => {
    expect(isMetaAccountBlock({ message: META_ERROR_REASONS.accountBlocked })).toBe(true);
  });

  it.each([
    ["a missing permission", { status: 400, code: 10, message: "Application does not have permission for this action" }],
    ["a closed messaging window", { status: 400, code: 10, subcode: 2534022, message: "This message is sent outside of allowed window." }],
    ["a person who cannot be found", { status: 400, code: 100, subcode: 2018001 }],
    ["throttling", { status: 400, code: 4, message: "Application request limit reached" }],
    ["a server error", { status: 500 }],
  ])("does not treat %s as an account block", (_label, details) => {
    expect(isMetaAccountBlock(details)).toBe(false);
    expect(describeMetaError(details)).not.toBe(META_ERROR_REASONS.accountBlocked);
  });

  it("still reports an expired token first", () => {
    expect(classifyMetaError({ status: 401, code: 368 })).toBe("token_expired");
    expect(describeMetaError({ status: 400, code: 190, message: BLOCKED_2022 })).toBe(META_ERROR_REASONS.tokenExpired);
  });
});

describe("Meta throttling", () => {
  it.each([4, 17, 32, 613, 80002, 80006])("treats Graph code %i as a request to slow down", (code) => {
    expect(META_RATE_LIMIT_CODES.has(code)).toBe(true);
    expect(isMetaRateLimit({ status: 400, code })).toBe(true);
    expect(classifyMetaError({ status: 400, code })).toBe("rate_limited");
    expect(describeMetaError({ status: 400, code })).toBe(META_ERROR_REASONS.rateLimited);
  });

  it("treats HTTP 429 as throttling and other rejections as ordinary", () => {
    expect(isMetaRateLimit({ status: 429 })).toBe(true);
    expect(isMetaRateLimit({ status: 400, code: 100 })).toBe(false);
    expect(classifyMetaError({ status: 400, code: 100 })).toBe("other");
  });
});

describe("account pause reasons", () => {
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;

  it("writes the pause length into the refused send's reason and reads it back", () => {
    const reason = accountPausedReason(24 * HOUR);
    expect(reason).toBe("Instagram has limited this account. Linkar paused automatic replies on it for 24 hours.");
    expect(parseAccountPauseReason(reason)).toEqual({ platform: "Instagram", durationMs: 24 * HOUR });
  });

  it("writes the time left into each held send's reason to the minute, rounding up", () => {
    const reason = accountSendHeldReason(22 * HOUR + 11.2 * MINUTE);
    expect(reason).toBe("Not sent. Instagram has limited this account, so Linkar paused sending from it for another 22 hours and 12 minutes.");
    expect(parseAccountPauseReason(reason)).toEqual({ platform: "Instagram", durationMs: 22 * HOUR + 12 * MINUTE });
    expect(accountSendHeldReason(0.1 * MINUTE)).toBe("Not sent. Instagram has limited this account, so Linkar paused sending from it for another 1 minute.");
    expect(parseAccountPauseReason(accountSendHeldReason(0.1 * MINUTE))).toEqual({ platform: "Instagram", durationMs: MINUTE });
    expect(accountSendHeldReason(HOUR + MINUTE)).toBe("Not sent. Instagram has limited this account, so Linkar paused sending from it for another 1 hour and 1 minute.");
    expect(accountSendHeldReason(45 * MINUTE)).toBe("Not sent. Instagram has limited this account, so Linkar paused sending from it for another 45 minutes.");
    expect(parseAccountPauseReason(accountSendHeldReason(45 * MINUTE))).toEqual({ platform: "Instagram", durationMs: 45 * MINUTE });
    // Never zero or unreadable.
    expect(parseAccountPauseReason(accountSendHeldReason(Number.NaN))).toEqual({ platform: "Instagram", durationMs: MINUTE });
  });

  it("names a Facebook Page as a Page", () => {
    const reason = accountPausedReason(HOUR, "Facebook");
    expect(reason).toBe("Facebook has limited this Page. Linkar paused automatic replies on it for 1 hour.");
    expect(parseAccountPauseReason(reason)).toEqual({ platform: "Facebook", durationMs: HOUR });
    expect(parseAccountPauseReason(accountSendHeldReason(5 * HOUR, "Facebook"))).toEqual({ platform: "Facebook", durationMs: 5 * HOUR });
  });

  it("ignores every other reason", () => {
    expect(parseAccountPauseReason(undefined)).toBeNull();
    expect(parseAccountPauseReason(META_ERROR_REASONS.accountBlocked)).toBeNull();
    expect(parseAccountPauseReason(ACCOUNT_THROTTLED_REASON)).toBeNull();
    expect(parseAccountPauseReason(ACCOUNT_RECOVERING_REASON)).toBeNull();
    expect(parseAccountPauseReason("Monthly delivery limit reached")).toBeNull();
  });

  it("keeps customer copy free of em dashes and internal words", () => {
    const copy = [
      META_ERROR_REASONS.accountBlocked,
      accountPausedReason(24 * 60 * 60_000),
      accountSendHeldReason(3 * 60 * 60_000 + 5 * 60_000, "Facebook"),
      ACCOUNT_THROTTLED_REASON,
      ACCOUNT_RECOVERING_REASON,
    ].join(" ");
    expect(copy).not.toMatch(/\u2014|payload|recipient|webhook/i);
  });
});

describe("Meta usage headers", () => {
  function headers(values: Record<string, string>) {
    return { get: (name: string) => values[name.toLowerCase()] ?? null };
  }

  it("returns null when Meta sent no usage headers", () => {
    expect(parseMetaUsageHeaders(headers({}))).toBeNull();
    expect(parseMetaUsageHeaders(headers({ "x-app-usage": "not json" }))).toBeNull();
  });

  it("reads the highest share from the app usage header", () => {
    expect(parseMetaUsageHeaders(headers({
      "x-app-usage": JSON.stringify({ call_count: 28, total_time: 64, total_cputime: 12 }),
    }))).toEqual({ highestPercent: 64, regainAccessMs: 0 });
  });

  it("reads business use case usage and Meta's time to regain access", () => {
    expect(parseMetaUsageHeaders(headers({
      "x-business-use-case-usage": JSON.stringify({
        "17841400000000000": [
          { type: "instagram", call_count: 100, total_cputime: 4, total_time: 9, estimated_time_to_regain_access: 7 },
        ],
      }),
    }))).toEqual({ highestPercent: 100, regainAccessMs: 7 * 60_000 });
  });
});
