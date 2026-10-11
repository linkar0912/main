import { describe, expect, it } from "vitest";
import { automationAttention, recentFailureCount } from "./automation-attention";
import { RECENT_FAILURE_WINDOW_MS } from "./home-attention";

const NOW = Date.parse("2026-10-11T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

const instagram = (status: "CONNECTED" | "EXPIRED" | "DISCONNECTED", igUserId = "ig_1", username = "studio") => ({ igUserId, username, status });
const live = { id: "auto_1", status: "ACTIVE", provider: "INSTAGRAM" };

describe("automationAttention", () => {
  it("stays quiet for a healthy live automation", () => {
    expect(automationAttention(live, { instagram: [instagram("CONNECTED")], facebook: [], failures: [], now: NOW })).toBeNull();
  });

  it("never flags drafts or paused automations", () => {
    const input = { instagram: [instagram("EXPIRED")], facebook: [], failures: [{ automationId: "auto_1", updatedAt: ago(HOUR) }], now: NOW };
    expect(automationAttention({ ...live, status: "DRAFT" }, input)).toBeNull();
    expect(automationAttention({ ...live, status: "PAUSED" }, input)).toBeNull();
  });

  it("asks to reconnect the pinned Instagram account when it expired", () => {
    const item = automationAttention({ ...live, instagramAccountId: "ig_2" }, {
      instagram: [instagram("CONNECTED"), instagram("EXPIRED", "ig_2", "@second")],
      facebook: [],
      failures: [],
      now: NOW,
    });
    expect(item).toMatchObject({ reason: "reconnect", tone: "danger", chip: "Expired", actionLabel: "Reconnect", short: "@second needs reconnecting" });
  });

  it("only flags an unpinned automation when no account can send", () => {
    const one = { instagram: [instagram("EXPIRED"), instagram("CONNECTED", "ig_2", "other")], facebook: [], failures: [], now: NOW };
    expect(automationAttention(live, one)).toBeNull();
    expect(automationAttention(live, { ...one, instagram: [instagram("DISCONNECTED")] })).toMatchObject({ reason: "reconnect", chip: "Disconnected" });
    expect(automationAttention(live, { ...one, instagram: [] })).toMatchObject({ reason: "connect", chip: "Not connected", actionLabel: "Connect" });
  });

  it("checks the pinned Facebook Page for a Facebook automation", () => {
    const facebookAutomation = { ...live, provider: "FACEBOOK", facebookPageId: "page_1" };
    const pages = [{ pageId: "page_1", pageName: "Studio Kavya", status: "EXPIRED" as const }];
    expect(automationAttention(facebookAutomation, { instagram: [], facebook: pages, failures: [], now: NOW }))
      .toMatchObject({ reason: "reconnect", text: "Studio Kavya needs reconnecting. Nothing replies on it until you do." });
    expect(automationAttention(facebookAutomation, { instagram: [], facebook: [], failures: [], now: NOW })).toMatchObject({ reason: "connect" });
  });

  it("waits for connections before claiming anything is disconnected", () => {
    expect(automationAttention(live, { instagram: null, facebook: null, failures: null, now: NOW })).toBeNull();
  });

  it("flags this automation's failures inside Home's 7-day window, not older ones or other automations'", () => {
    const failures = [
      { automationId: "auto_1", updatedAt: ago(2 * HOUR) },
      { automationId: "auto_1", updatedAt: ago(RECENT_FAILURE_WINDOW_MS + HOUR) },
      { automationId: "auto_2", updatedAt: ago(HOUR) },
      { updatedAt: ago(HOUR) },
    ];
    expect(recentFailureCount("auto_1", failures, NOW)).toBe(1);
    expect(automationAttention(live, { instagram: [instagram("CONNECTED")], facebook: [], failures, now: NOW }))
      .toMatchObject({ reason: "failures", tone: "warning", chip: "Failed", actionLabel: "Fix", text: "1 message couldn't be sent in the last 7 days." });
  });

  it("puts a broken connection ahead of failures", () => {
    const item = automationAttention(live, { instagram: [instagram("EXPIRED")], facebook: [], failures: [{ automationId: "auto_1", updatedAt: ago(HOUR) }], now: NOW });
    expect(item?.reason).toBe("reconnect");
  });
});
