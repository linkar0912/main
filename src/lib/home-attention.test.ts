import { describe, expect, it } from "vitest";
import { activeAccountPause, deriveAttentionItems, type AttentionInput } from "./home-attention";
import { formatDateParts } from "./format-date";
import { accountPausedReason, accountSendHeldReason } from "./meta/errors";

const NOW = Date.parse("2026-10-11T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function input(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    connections: [{ kind: "instagram", name: "studio.kavya", status: "CONNECTED" }],
    automations: [{ id: "a1", name: "Price list", status: "ACTIVE" }],
    automationsKnown: true,
    failures: [],
    usage: { deliveriesThisMonth: 100, monthlyDeliveryLimit: 1_000 },
    now: NOW,
    ...overrides,
  };
}

describe("deriveAttentionItems", () => {
  it("is empty for a healthy workspace", () => {
    expect(deriveAttentionItems(input())).toEqual([]);
  });

  it("flags an expired connection as the most urgent item, with a way to fix it", () => {
    const items = deriveAttentionItems(input({
      connections: [{ kind: "instagram", name: "studio.kavya", status: "EXPIRED" }, { kind: "facebook", name: "Studio Kavya", status: "CONNECTED" }],
      automations: [{ id: "a1", name: "Price list", status: "PAUSED" }, { id: "a2", name: "Welcome", status: "ACTIVE" }],
    }));
    expect(items[0]).toMatchObject({ tone: "danger", chip: "Expired", action: { kind: "link", href: "/settings" } });
    expect(items[0].text).toBe("@studio.kavya needs reconnecting. Nothing replies on it until you do.");
    expect(items.map((item) => item.key)).toEqual(["connection:instagram:studio.kavya", "paused"]);
  });

  it("only claims nothing is connected once connections are known", () => {
    expect(deriveAttentionItems(input({ connections: null }))).toEqual([]);
    expect(deriveAttentionItems(input({ connections: [] }))[0]).toMatchObject({ key: "connection:none", tone: "danger" });
    // A brand-new workspace gets the guided start instead.
    expect(deriveAttentionItems(input({ connections: [], automations: [] }))).toEqual([]);
  });

  it("warns at 80% of the plan and turns danger when it runs out", () => {
    expect(deriveAttentionItems(input({ usage: { deliveriesThisMonth: 799, monthlyDeliveryLimit: 1_000 } }))).toEqual([]);
    expect(deriveAttentionItems(input({ usage: { deliveriesThisMonth: 850, monthlyDeliveryLimit: 1_000 } }))[0])
      .toMatchObject({ tone: "warning", chip: "Limit near", text: "850 of 1,000 messages used this month (85%)." });
    expect(deriveAttentionItems(input({ usage: { deliveriesThisMonth: 1_000, monthlyDeliveryLimit: 1_000 } }))[0])
      .toMatchObject({ tone: "danger", chip: "Limit reached", action: { href: "/settings?section=billing" } });
    expect(deriveAttentionItems(input({ usage: { deliveriesThisMonth: 9_999, monthlyDeliveryLimit: null } }))).toEqual([]);
  });

  it("says replies are paused until the reset date, with Upgrade, once the plan limit is hit", () => {
    const [item] = deriveAttentionItems(input({ usage: { deliveriesThisMonth: 1_000, monthlyDeliveryLimit: 1_000 } }));
    expect(item).toMatchObject({
      tone: "danger",
      chip: "Limit reached",
      text: "Monthly limit reached - replies are paused until 1 November or you upgrade.",
      action: { kind: "link", label: "Upgrade", href: "/settings?section=billing" },
    });
  });

  it("flags the limit as soon as a send this month was blocked by it, and doesn't count those as failures", () => {
    const blocked = { updatedAt: new Date(NOW - 60_000).toISOString(), lastError: "Monthly delivery limit reached", resultCode: "SUPPRESSED" };
    const items = deriveAttentionItems(input({
      // Usage has not caught up (or did not load) - the blocked sends still prove it.
      usage: null,
      failures: [blocked, blocked, blocked],
    }));
    expect(items).toEqual([expect.objectContaining({ key: "usage", chip: "Limit reached", action: expect.objectContaining({ label: "Upgrade" }) })]);
  });

  it("does not flag the limit for blocks from a previous month", () => {
    const items = deriveAttentionItems(input({
      failures: [{ updatedAt: "2026-09-30T23:00:00.000Z", lastError: "Monthly delivery limit reached", resultCode: "SUPPRESSED" }],
    }));
    expect(items).toEqual([]);
  });

  it("counts only failures from the last 7 days", () => {
    const items = deriveAttentionItems(input({
      failures: [
        { updatedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString() },
        { updatedAt: new Date(NOW - 6 * DAY).toISOString() },
        { updatedAt: new Date(NOW - 9 * DAY).toISOString() },
      ],
    }));
    expect(items).toEqual([expect.objectContaining({
      key: "failures",
      text: "2 messages couldn't be sent in the last 7 days.",
      action: { kind: "failures", label: "Review" },
    })]);
    expect(deriveAttentionItems(input({ failures: [{ updatedAt: new Date(NOW - 9 * DAY).toISOString() }] }))).toEqual([]);
  });

  it("names a single paused automation and links straight to it", () => {
    const [item] = deriveAttentionItems(input({ automations: [{ id: "a1", name: "Kurta restock", status: "PAUSED" }, { id: "a2", name: "Welcome", status: "ACTIVE" }] }));
    expect(item).toMatchObject({ chip: "Paused", text: "Kurta restock is paused, so it isn't replying.", action: { href: "/automations/a1/edit" } });
  });

  it("summarises several paused automations, and nudges when only drafts exist", () => {
    const paused = deriveAttentionItems(input({ automations: [{ id: "a1", name: "A", status: "PAUSED" }, { id: "a2", name: "B", status: "PAUSED" }] }));
    expect(paused[0]).toMatchObject({ text: "2 automations are paused, so they aren't replying.", action: { href: "/automations" } });
    const drafts = deriveAttentionItems(input({ automations: [{ id: "a1", name: "A", status: "DRAFT" }] }));
    expect(drafts[0]).toMatchObject({ key: "none-on", chip: "Off" });
  });

  it("ignores automation state while the list is unknown", () => {
    expect(deriveAttentionItems(input({ automationsKnown: false, automations: [{ id: "a1", name: "A", status: "PAUSED" }] }))).toEqual([]);
  });
  describe("when Meta limits an account", () => {
    const HOUR = 60 * 60 * 1000;
    const restartLabel = (at: number) =>
      formatDateParts(new Date(at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

    it("says plainly that replies are paused, and until when", () => {
      const blockedAt = NOW - 2 * HOUR;
      const items = deriveAttentionItems(input({
        failures: [{ updatedAt: new Date(blockedAt).toISOString(), lastError: accountPausedReason(24 * HOUR), resultCode: "PROVIDER_REJECTED" }],
      }));
      expect(items).toEqual([{
        key: "account-paused",
        tone: "danger",
        chip: "Limited",
        text: `Instagram has limited one of your accounts. Linkar paused its automatic replies until ${restartLabel(blockedAt + 24 * HOUR)}.`,
        action: { kind: "link", label: "See activity", href: "/activity" },
      }]);
      expect(items[0].text).not.toMatch(/\u2014|payload|recipient|webhook/i);
    });

    it("finds the end from held sends when the refused one has scrolled out of the recent list", () => {
      const until = NOW + 5 * HOUR + 7 * 60_000;
      const held = Array.from({ length: 50 }, (_, index) => {
        const recordedAt = NOW - index * 60_000;
        return {
          updatedAt: new Date(recordedAt).toISOString(),
          lastError: accountSendHeldReason(until - recordedAt),
          resultCode: "SUPPRESSED",
        };
      });
      // Every record agrees on the real end, to the minute: no hour of rounding.
      expect(activeAccountPause(held, NOW)).toEqual({ until, platform: "Instagram" });
      // The held sends are the pause, not 50 separate failures.
      expect(deriveAttentionItems(input({ failures: held })).map((item) => item.key)).toEqual(["account-paused"]);
    });

    it("names a Facebook Page as a Page", () => {
      const [item] = deriveAttentionItems(input({
        failures: [{ updatedAt: new Date(NOW).toISOString(), lastError: accountPausedReason(3 * HOUR, "Facebook") }],
      }));
      expect(item.text).toBe(`Facebook has limited one of your Pages. Linkar paused its automatic replies until ${restartLabel(NOW + 3 * HOUR)}.`);
    });

    it("drops the notice once the pause has ended, and then counts what was not sent", () => {
      const failures = [{ updatedAt: new Date(NOW - 25 * HOUR).toISOString(), lastError: accountPausedReason(24 * HOUR) }];
      expect(activeAccountPause(failures, NOW)).toBeNull();
      // Gone within a minute of the restart, not up to an hour later.
      const endingSoon = [{
        updatedAt: new Date(NOW).toISOString(),
        lastError: accountSendHeldReason(2 * HOUR + 30 * 60_000),
      }];
      expect(activeAccountPause(endingSoon, NOW + 2 * HOUR + 29 * 60_000)).not.toBeNull();
      expect(activeAccountPause(endingSoon, NOW + 2 * HOUR + 30 * 60_000)).toBeNull();
      expect(deriveAttentionItems(input({ failures })).map((item) => item.key)).toEqual(["failures"]);
    });

    it("ignores other reasons and unreadable times", () => {
      expect(activeAccountPause(null, NOW)).toBeNull();
      expect(activeAccountPause([
        { updatedAt: new Date(NOW).toISOString(), lastError: "Instagram has limited this account, so it can't send messages right now." },
        { updatedAt: "not a date", lastError: accountPausedReason(24 * HOUR) },
      ], NOW)).toBeNull();
    });
  });
});
