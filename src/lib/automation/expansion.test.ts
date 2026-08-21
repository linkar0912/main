import { describe, expect, it } from "vitest";
import { evaluateFlow } from "./engine";
import { matchesTrigger } from "./match";
import { validateFlowDefinition } from "./definition";
import { withinSchedule } from "./types";
import type { FlowDefinitionV1, NormalizedEvent } from "./types";

const NOW = Date.parse("2026-08-21T10:00:00.000Z");

const dmEvent: NormalizedEvent = {
  id: "dm_1",
  accountId: "ig_business_1",
  type: "message.received",
  text: "hello there",
  recipientId: "user_1",
  timestamp: NOW,
};

const referralEvent: NormalizedEvent = {
  id: "ref_1",
  accountId: "ig_business_1",
  type: "referral.received",
  text: "summer_drop",
  recipientId: "user_1",
  interactionPayload: "summer_drop",
  timestamp: NOW,
};

function dmFlow(overrides: Partial<FlowDefinitionV1> = {}): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "message", match: "any", keywords: [] },
    conditions: [],
    actions: [{ type: "send_text", text: "Hi!" }],
    ...overrides,
  };
}

describe("flow schedule windows", () => {
  it("accepts events inside the window and skips those outside", () => {
    expect(withinSchedule(undefined, new Date(NOW))).toBe(true);
    expect(
      withinSchedule({ startsAt: "2026-08-21T09:00:00.000Z", endsAt: "2026-08-21T11:00:00.000Z" }, new Date(NOW)),
    ).toBe(true);
    expect(withinSchedule({ startsAt: "2026-08-21T10:00:01.000Z" }, new Date(NOW))).toBe(false);
    expect(withinSchedule({ endsAt: "2026-08-21T10:00:00.000Z" }, new Date(NOW))).toBe(false);
  });

  it("skips events outside the scheduled window with a distinct reason", () => {
    const flow = dmFlow({ schedule: { endsAt: "2026-08-21T09:59:59.000Z" } });
    expect(evaluateFlow(flow, dmEvent)).toMatchObject({ status: "skipped", reason: "outside scheduled window" });
  });

  it("evaluates events inside the scheduled window normally", () => {
    const flow = dmFlow({ schedule: { startsAt: "2026-08-21T09:00:00.000Z" } });
    const result = evaluateFlow(flow, dmEvent);
    expect(result.status).toBe("matched");
    expect(result.actions).toHaveLength(1);
  });
});

describe("referral and opt-in triggers", () => {
  it("matches referral taps and ignores other events", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "referral" },
      conditions: [],
      actions: [{ type: "send_text", text: "Welcome!" }],
    };
    expect(matchesTrigger(flow, referralEvent)).toBe(true);
    expect(matchesTrigger(flow, dmEvent)).toBe(false);
  });

  it("matches opt-in taps", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "optin" },
      conditions: [],
      actions: [{ type: "send_text", text: "Here you go" }],
    };
    const optinEvent: NormalizedEvent = { ...referralEvent, id: "opt_1", type: "optin.received", interactionPayload: undefined };
    expect(matchesTrigger(flow, optinEvent)).toBe(true);
  });

  it("sends every action in order for referral taps", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "referral" },
      conditions: [],
      actions: [
        { type: "send_text", text: "First" },
        { type: "send_button", text: "Second", buttonLabel: "Open", url: "https://example.com/x" },
      ],
    };
    const result = evaluateFlow(flow, referralEvent);
    expect(result.status).toBe("matched");
    expect(result.actions.map((action) => action.type)).toEqual(["send_text", "send_button"]);
  });
});

describe("validateFlowDefinition expansion rules", () => {
  it("accepts a referral trigger with up to three send actions", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "referral" },
      conditions: [],
      actions: [
        { type: "send_text", text: "One" },
        { type: "send_link", text: "Two", url: "https://example.com/a" },
        { type: "send_button", text: "Three", buttonLabel: "Open", url: "https://example.com/b" },
      ],
      dailySendLimit: 25,
      schedule: { startsAt: "2026-08-01T00:00:00.000Z" },
    });
    expect(flow.version === 1 && flow.actions).toHaveLength(3);
    expect(flow).toMatchObject({ dailySendLimit: 25 });
  });

  it("rejects more than three actions and referral triggers with conditions", () => {
    const actions = [
      { type: "send_text", text: "One" },
      { type: "send_text", text: "Two" },
      { type: "send_text", text: "Three" },
      { type: "send_text", text: "Four" },
    ];
    expect(() =>
      validateFlowDefinition({ version: 1, trigger: { type: "referral" }, conditions: [], actions }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "referral" },
        conditions: [{ type: "contains_keyword", keywords: ["x"] }],
        actions: [{ type: "send_text", text: "One" }],
      }),
    ).toThrow();
  });

  it("keeps comment triggers limited to a single private reply", () => {
    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["hi"], mediaIds: [] },
        conditions: [],
        actions: [
          { type: "private_reply", text: "One" },
          { type: "private_reply", text: "Two" },
        ],
      }),
    ).toThrow();
  });

  it("normalizes schedule bounds and permits the ungated follow gate", () => {
    const flow = validateFlowDefinition({
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["On it!"],
      openingMessage: { text: "Want the link?", optInButtonLabel: "Yes" },
      followGate: { required: false },
      delivery: { text: "Here you go", url: "https://example.com/thing" },
      schedule: { startsAt: "2026-08-01T00:00:00+02:00" },
    });
    if (flow.version !== 2) throw new Error("expected a version 2 definition");
    expect(flow.schedule?.startsAt).toBe("2026-07-31T22:00:00.000Z");
    expect(flow.followGate).toMatchObject({ required: false, notFollowingMessage: "" });
  });

  it("captures opening and delivery text variants", () => {
    const flow = validateFlowDefinition({
      version: 2,
      trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
      publicReplies: ["On it!"],
      openingMessage: { text: "Want it?", textVariants: [" Interested?", "  Interested? ", "Say the word"], optInButtonLabel: "Yes" },
      followGate: { required: true, notFollowingMessage: "Follow first", recheckButtonLabel: "Done" },
      delivery: { text: "Enjoy", textVariants: ["Enjoy!"], url: "https://example.com/thing" },
    });
    if (flow.version !== 2) throw new Error("expected a version 2 definition");
    expect(flow.openingMessage.textVariants).toEqual(["Interested?", "Say the word"]);
    expect(flow.delivery.textVariants).toEqual(["Enjoy!"]);
  });
});
