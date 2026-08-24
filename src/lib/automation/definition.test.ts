import { describe, expect, it } from "vitest";
import { validateFlowDefinition } from "./definition";

const campaign = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: ["media_1"],
    mediaSnapshots: [
      {
        id: "media_1",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/demo/",
        timestamp: "2026-08-21T00:00:00.000Z",
      },
    ],
    match: "keyword",
    keywords: [" Guide ", "PDF"],
  },
  publicReplies: ["Check your DMs"],
  openingMessage: { text: "Reply below so I can check your follow status.", optInButtonLabel: "Check follow" },
  followGate: {
    required: true,
    notFollowingMessage: "Follow this account, then tap below.",
    recheckButtonLabel: "I've followed",
  },
  delivery: {
    text: "You're verified - here is your guide.",
    url: "https://example.com/guide",
    buttonLabel: "Open guide",
  },
};

describe("validateFlowDefinition", () => {
  it("accepts a comment keyword flow with a private reply", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: [" GUIDE "], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here is the guide: https://example.com/guide" }],
    });

    expect(flow.trigger.type).toBe("comment");
    if (flow.trigger.type !== "comment") return;
    expect(flow.trigger.keywords).toEqual(["guide"]);
  });

  it("rejects flows without actions and invalid links", () => {
    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
        conditions: [],
        actions: [],
      }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [{ type: "send_link", text: "Click", url: "not-a-url" }],
      }),
    ).toThrow();
  });

  it("allows only one private text reply for comment triggers", () => {
    expect(() => validateFlowDefinition({
      version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [],
      actions: [{ type: "send_link", text: "Guide", url: "https://example.com/guide" }],
    })).toThrow("Comment triggers support only a private reply");
    expect(() => validateFlowDefinition({
      version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [],
      actions: [{ type: "private_reply", text: "One" }, { type: "private_reply", text: "Two" }],
    })).toThrow();
  });

  it("requires message keyword triggers to contain keywords", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hello" }],
    })).toThrow("Keyword triggers need at least one keyword");
  });

  it("rejects keywords on any-message triggers", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "any", keywords: ["hello"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hello" }],
    })).toThrow("Any-message triggers cannot include keywords");
  });

  it("accepts and normalizes a version 2 campaign", () => {
    expect(validateFlowDefinition(campaign)).toMatchObject({
      version: 2,
      trigger: { keywords: ["guide", "pdf"] },
    });
  });

  it("accepts a media snapshot timestamp in Meta's actual offset format", () => {
    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: {
          ...campaign.trigger,
          mediaSnapshots: [{ ...campaign.trigger.mediaSnapshots[0], timestamp: "2026-08-21T00:00:00+0000" }],
        },
      }),
    ).not.toThrow();
  });

  it("rejects a media snapshot with an unparseable timestamp", () => {
    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: {
          ...campaign.trigger,
          mediaSnapshots: [{ ...campaign.trigger.mediaSnapshots[0], timestamp: "not-a-date" }],
        },
      }),
    ).toThrow();
  });

  it("rejects invalid version 2 media targeting and keyword configurations", () => {
    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: { ...campaign.trigger, mediaIds: [] },
      }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: { ...campaign.trigger, keywords: ["Guide", "  "] },
      }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: {
          ...campaign.trigger,
          mediaSnapshots: [{ ...campaign.trigger.mediaSnapshots[0], id: "media_2" }],
        },
      }),
    ).toThrow();
  });

  it("rejects version 2 keywords duplicated after trim and lowercase normalization", () => {
    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: { ...campaign.trigger, keywords: ["Guide", " guide "] },
      }),
    ).toThrow("Keywords must be unique after normalization");
  });

  it("rejects duplicate version 2 media snapshot IDs", () => {
    expect(() =>
      validateFlowDefinition({
        ...campaign,
        trigger: {
          ...campaign.trigger,
          mediaSnapshots: [campaign.trigger.mediaSnapshots[0], campaign.trigger.mediaSnapshots[0]],
        },
      }),
    ).toThrow("Media snapshot IDs must be unique");
  });

  it("limits version 2 public replies and quick-reply labels", () => {
    expect(() =>
      validateFlowDefinition({ ...campaign, publicReplies: Array.from({ length: 6 }, (_, index) => `Reply ${index}`) }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        ...campaign,
        openingMessage: { ...campaign.openingMessage, optInButtonLabel: "a".repeat(21) },
      }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        ...campaign,
        followGate: { ...campaign.followGate, recheckButtonLabel: "a".repeat(21) },
      }),
    ).toThrow();
  });

  it("accepts a version 2 campaign with zero public replies", () => {
    expect(validateFlowDefinition({ ...campaign, publicReplies: [] })).toMatchObject({ publicReplies: [] });
  });

  it("requires follow-gate prompt and recheck copy when the gate is enabled", () => {
    expect(() => validateFlowDefinition({
      ...campaign,
      followGate: { required: true, recheckButtonLabel: "I've followed" },
    })).toThrow("Follow-gated campaigns need a not-following message");

    expect(() => validateFlowDefinition({
      ...campaign,
      followGate: { required: true, notFollowingMessage: "Follow this account" },
    })).toThrow("Follow-gated campaigns need a recheck button label");
  });

  it("requires an HTTPS version 2 delivery URL outside development", () => {
    expect(() =>
      validateFlowDefinition({ ...campaign, delivery: { ...campaign.delivery, url: "http://example.com/guide" } }),
    ).toThrow();
  });

  it("accepts an image action with a caption and strips nothing from the URL", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_image", imageUrl: "https://example.com/prices.jpg", caption: "Latest prices 🏷️" }],
    });
    expect(flow.version).toBe(1);
    if (flow.version !== 1) return;
    expect(flow.actions[0]).toEqual({
      type: "send_image",
      imageUrl: "https://example.com/prices.jpg",
      caption: "Latest prices 🏷️",
    });
  });

  it("rejects image actions on comment triggers and with private image URLs", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
      conditions: [],
      actions: [{ type: "send_image", imageUrl: "https://example.com/x.jpg" }],
    })).toThrow("Comment triggers support only a private reply");
  });

  it("accepts follow-ups on DM triggers with button+url pairing", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Offer inside" }],
      followUps: [
        { delayMinutes: 1440, text: "Still interested?", buttonLabel: "Claim", url: "https://example.com/offer" },
        { delayMinutes: 60, text: "Last call!" },
      ],
    });
    if (flow.version !== 1 || !flow.followUps) return;
    expect(flow.followUps).toHaveLength(2);
    expect(flow.followUps[0].buttonLabel).toBe("Claim");
  });

  it("rejects follow-ups on comment triggers, without URLs under buttons, or beyond bounds", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Hi" }],
      followUps: [{ delayMinutes: 60, text: "Nudge" }],
    })).toThrow("Comment triggers cannot schedule follow-ups");

    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Offer" }],
      followUps: [{ delayMinutes: 60, text: "Nudge", buttonLabel: "No URL" }],
    })).toThrow();

    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Offer" }],
      followUps: [{ delayMinutes: 0, text: "Too soon" }],
    })).toThrow();
  });

  it("accepts typed capture fields with exit keywords and exit text", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["webinar"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Let's register you" }],
      emailCapture: {
        promptText: "Your email?",
        confirmationText: "Confirmed!",
        exitText: "No worries!",
        fields: [
          { id: "phone", question: "Phone number?", kind: "phone", exitKeywords: ["no", "skip"] },
          { id: "team", question: "Team size?", kind: "number" },
        ],
      },
    });
    if (flow.version !== 1 || !flow.emailCapture?.fields) return;
    expect(flow.emailCapture.fields[0].kind).toBe("phone");
    expect(flow.emailCapture.fields[0].exitKeywords).toEqual(["no", "skip"]);
    expect(flow.emailCapture.exitText).toBe("No worries!");
  });
});
