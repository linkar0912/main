import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { validateFlowDefinition, validateFlowDefinitionForTarget } from "./definition";

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

/** The validation issues for a definition, or none when it saves. Anything but a ZodError is rethrown. */
function validationIssues(input: unknown): Array<{ path: PropertyKey[]; message: string }> {
  try {
    validateFlowDefinition(input);
    return [];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  }
}

describe("validateFlowDefinition", () => {
  it("returns field-addressable errors for a definition incompatible with its channel", () => {
    try {
      validateFlowDefinitionForTarget({
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [{ type: "send_text", text: "Hello" }],
      }, { provider: "FACEBOOK", surface: "COMMENT" });
      throw new Error("expected channel validation to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "invalid_channel_definition",
        issues: [
          { path: ["trigger", "type"] },
          { path: ["actions", 0, "type"] },
        ],
      });
    }
  });
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

  it("reports a link that is not a URL as a validation error on its field, not a crash", () => {
    const messageFlow = (action: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [action],
      ...extra,
    });
    const linkCases: Array<[unknown, PropertyKey[]]> = [
      [messageFlow({ type: "send_link", text: "Click", url: "not a url" }), ["actions", 0, "url"]],
      [messageFlow({ type: "send_button", text: "Hi", buttonLabel: "Open", url: "not a url" }), ["actions", 0, "url"]],
      [messageFlow({ type: "send_text", text: "Hi" }, {
        followUps: [{ delayMinutes: 5, text: "Still there?", buttonLabel: "Open", url: "not a url" }],
      }), ["followUps", 0, "url"]],
      [{ ...campaign, delivery: { ...campaign.delivery, url: "not a url" } }, ["delivery", "url"]],
      [{
        ...campaign,
        trigger: { ...campaign.trigger, mediaSnapshots: [{ ...campaign.trigger.mediaSnapshots[0], permalink: "not a url" }] },
      }, ["trigger", "mediaSnapshots", 0, "permalink"]],
    ];
    for (const [input, path] of linkCases) {
      const issues = validationIssues(input);
      expect(issues.length, path.join(".")).toBeGreaterThan(0);
      expect(issues.every((issue) => issue.path.join(".") === path.join(".")), path.join(".")).toBe(true);
    }
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

  it("accepts a quick-reply action and normalizes its chips", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "quick_replies", text: "  Interested?  ", replies: ["  Yes  ", "", "Not now"] }],
    });
    expect(flow.version).toBe(1);
    if (flow.version !== 1) return;
    expect(flow.actions[0]).toEqual({
      type: "quick_replies",
      text: "Interested?",
      replies: ["Yes", "Not now"],
    });
  });

  it("rejects quick-reply actions with no usable chips, too many chips, or on comment triggers", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "quick_replies", text: "Interested?", replies: ["  ", ""] }],
    })).toThrow();

    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "quick_replies", text: "Interested?", replies: ["a", "b", "c", "d", "e"] }],
    })).toThrow();

    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
      conditions: [],
      actions: [{ type: "quick_replies", text: "Interested?", replies: ["Yes"] }],
    })).toThrow("Comment triggers support only a private reply");
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

  describe("keyword and media bounds", () => {
    const commentFlow = (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [], ...trigger },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
      ...extra,
    });
    const keywords = (count: number) => Array.from({ length: count }, (_, index) => `keyword ${index}`);
    const mediaIds = (count: number) => Array.from({ length: count }, (_, index) => `media_${index}`);

    it("rejects a 5,000-keyword definition and accepts up to 50 keywords", () => {
      expect(() => validateFlowDefinition(commentFlow({ keywords: keywords(5_000) }))).toThrow("Use 50 keywords or fewer");
      expect(() => validateFlowDefinition(commentFlow({ keywords: keywords(51) }))).toThrow("Use 50 keywords or fewer");
      expect(validateFlowDefinition(commentFlow({ keywords: keywords(50) })).trigger).toMatchObject({
        keywords: keywords(50),
      });
      expect(() => validateFlowDefinition({
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: keywords(51) },
        conditions: [],
        actions: [{ type: "send_text", text: "Hi" }],
      })).toThrow("Use 50 keywords or fewer");
      expect(() => validateFlowDefinition({
        ...campaign,
        trigger: { ...campaign.trigger, keywords: keywords(51) },
      })).toThrow("Use 50 keywords or fewer");
    });

    it("rejects a 101-character keyword and accepts 100 characters", () => {
      expect(() => validateFlowDefinition(commentFlow({ keywords: ["a".repeat(101)] })))
        .toThrow("Keep each keyword to 100 characters or fewer");
      expect(validateFlowDefinition(commentFlow({ keywords: ["a".repeat(100)] })).trigger)
        .toMatchObject({ keywords: ["a".repeat(100)] });
      expect(() => validateFlowDefinition(commentFlow({ keywords: [`a${" ".repeat(10)}${"b".repeat(100)}`] })))
        .toThrow("Keep each keyword to 100 characters or fewer");
    });

    it("caps media ids, condition keywords and conditions", () => {
      expect(() => validateFlowDefinition(commentFlow({ mediaIds: mediaIds(101) }))).toThrow("Choose 100 posts or fewer");
      expect(validateFlowDefinition(commentFlow({ mediaIds: mediaIds(100) })).trigger).toMatchObject({
        mediaIds: mediaIds(100),
      });
      expect(() => validateFlowDefinition(commentFlow({}, {
        conditions: [{ type: "media_is", mediaIds: mediaIds(101) }],
      }))).toThrow("Choose 100 posts or fewer");
      expect(() => validateFlowDefinition(commentFlow({}, {
        conditions: [{ type: "contains_keyword", keywords: keywords(51) }],
      }))).toThrow("Use 50 keywords or fewer");
      expect(() => validateFlowDefinition(commentFlow({}, {
        conditions: Array.from({ length: 11 }, () => ({ type: "contains_keyword", keywords: ["pdf"] })),
      }))).toThrow("Use 10 conditions or fewer");

      const snapshots = mediaIds(101).map((id) => ({ ...campaign.trigger.mediaSnapshots[0], id }));
      expect(() => validateFlowDefinition({
        ...campaign,
        trigger: { ...campaign.trigger, mediaIds: mediaIds(101), mediaSnapshots: snapshots },
      })).toThrow("Choose 100 posts or fewer");
    });

    it("accepts regex keywords the linear-time matcher compiles, including former ReDoS patterns", () => {
      const patterns = [
        "^size\\s*\\d+$", "(a|a)+$", "((a+))+$", "(a+){2,}$", "(.*a){12}$", "(\\w|\\d)*$",
        // Groups holding only assertions may be repeated, as in JavaScript.
        "(?:^)+price", "(\\b)*guide", "guide($){1,}",
      ];
      for (const pattern of patterns) {
        expect(validateFlowDefinition(commentFlow({ mode: "regex", keywords: [pattern] })).trigger)
          .toMatchObject({ keywords: [pattern] });
      }
    });

    it("rejects regex keywords the matcher cannot compile or that exceed 100 characters", () => {
      const refusals: Array<[string, string]> = [
        ["(", "This pattern is not a valid regular expression. Check its brackets, parentheses and repeats"],
        ["(?=price)p", "This pattern uses a lookaround, such as (?=...) or (?<!...), which the matcher does not support"],
        ["(a)\\1", "This pattern uses a backreference, such as \\1, which the matcher does not support"],
        ["(?i)link", "This pattern uses inline flags, such as (?i), which the matcher does not support"],
        ["\\p{L}+", "This pattern uses an escape the matcher does not support, such as \\p{...}"],
        ["a{5000}", "This pattern is too big once its repeats are counted"],
      ];
      for (const [pattern, message] of refusals) {
        const issues = validationIssues(commentFlow({ mode: "regex", keywords: ["ok", pattern] }));
        expect(issues, pattern).toHaveLength(1);
        expect(issues[0], pattern).toMatchObject({ path: ["trigger", "keywords", 1] });
        expect(issues[0].message, pattern).toContain(message);
      }
      expect(() => validateFlowDefinition(commentFlow({ mode: "regex", keywords: [`${"a".repeat(99)}+$`] })))
        .toThrow("Keep each keyword to 100 characters or fewer");
      expect(() => validateFlowDefinition({
        version: 1,
        trigger: { type: "story_reply", match: "keyword", mode: "regex", keywords: ["(?<=x)y"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Hi" }],
      })).toThrow("This pattern uses a lookaround");
    });

    it("explains a pattern that is too big once its repeats are counted, not as a lookaround", () => {
      for (const pattern of ["price.{0,150}", "(price|cost|rate|kitna|how much){1,10}"]) {
        const issues = validationIssues(commentFlow({ mode: "regex", keywords: [pattern] }));
        expect(issues.map((issue) => issue.message), pattern).toEqual([
          "This pattern is too big once its repeats are counted. Use smaller repeat numbers, such as {0,20} instead of {0,150}, or fewer alternatives",
        ]);
        expect(issues[0].message).not.toMatch(/lookaround|backreference/);
      }
      // The smaller repeat the message suggests saves.
      expect(validateFlowDefinition(commentFlow({ mode: "regex", keywords: ["price.{0,20}"] })).trigger)
        .toMatchObject({ keywords: ["price.{0,20}"] });
    });

    it("rejects a pattern that gives two groups the same name, as JavaScript does", () => {
      const issues = validationIssues(commentFlow({ mode: "regex", keywords: ["(?<a>x)(?<a>y)"] }));
      expect(issues).toEqual([expect.objectContaining({
        path: ["trigger", "keywords", 0],
        message: "Two groups in this pattern share a name. Give each named group its own name",
      })]);
      expect(validateFlowDefinition(commentFlow({ mode: "regex", keywords: ["(?<a>x)(?<b>y)"] })).trigger)
        .toMatchObject({ keywords: ["(?<a>x)(?<b>y)"] });
    });

    it("keeps the case of regex keywords so escapes like \\D keep their meaning", () => {
      expect(validateFlowDefinition(commentFlow({ mode: "regex", keywords: [" \\D+\\S ", "\\D+\\S"] })).trigger)
        .toMatchObject({ keywords: ["\\D+\\S"] });
      expect(validateFlowDefinition(commentFlow({ mode: "any", keywords: [" GUIDE "] })).trigger)
        .toMatchObject({ keywords: ["guide"] });
    });
  });
});

describe("public link shorteners at save time", () => {
  const shortenerError = /Short links from (\S+) are not allowed\. Paste the full link instead/;

  function issuesOf(input: unknown): Array<{ path: PropertyKey[]; message: string }> {
    try {
      validateFlowDefinition(input);
    } catch (error) {
      return (error as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues ?? [];
    }
    return [];
  }

  it("refuses a shortened button link with a plain, field-addressed error", () => {
    const issues = issuesOf({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["shop"] },
      conditions: [],
      actions: [{ type: "send_button", text: "Here you go", buttonLabel: "Shop now", url: "https://bit.ly/shop" }],
    });
    expect(issues).toEqual([
      expect.objectContaining({ path: ["actions", 0, "url"], message: expect.stringMatching(shortenerError) }),
    ]);
    expect(issues[0]?.message).toContain("bit.ly");
  });

  it("refuses a short link typed into a private reply or a follow-up", () => {
    expect(issuesOf({
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here’s your guide: tinyurl.com/free-guide" }],
    })).toEqual([expect.objectContaining({ path: ["actions", 0, "text"] })]);

    expect(issuesOf({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["offer"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Offer inside" }],
      followUps: [{ delayMinutes: 60, text: "Still keen?", buttonLabel: "Use my code", url: "https://cutt.ly/code" }],
    })).toEqual([expect.objectContaining({ path: ["followUps", 0, "url"] })]);
  });

  it("refuses a shortened delivery link or opening message in a two-step campaign", () => {
    expect(issuesOf({ ...campaign, delivery: { ...campaign.delivery, url: "https://rb.gy/guide" } }))
      .toEqual([expect.objectContaining({ path: ["delivery", "url"], message: expect.stringContaining("rb.gy") })]);
    expect(issuesOf({ ...campaign, publicReplies: ["Link: t.co/abc"] }))
      .toEqual([expect.objectContaining({ path: ["publicReplies", 0] })]);
  });

  it("ignores a short link in the post's own caption, which the customer did not write", () => {
    const flow = validateFlowDefinition({
      ...campaign,
      trigger: {
        ...campaign.trigger,
        mediaSnapshots: [{ ...campaign.trigger.mediaSnapshots[0], caption: "New drop! Link in bio bit.ly/drop" }],
      },
    });
    expect(flow.version).toBe(2);
  });

  it("ignores short links used as trigger words, such as words that filter out spam comments", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: {
        type: "comment",
        match: "keyword",
        keywords: ["price", "bit.ly/free"],
        negativeKeywords: ["tinyurl.com/win", "t.co/"],
        mediaIds: [],
      },
      conditions: [{ type: "contains_keyword", keywords: ["cutt.ly/deal"] }],
      actions: [{ type: "private_reply", text: "Here are our prices." }],
    })).not.toThrow();
  });

  it("still accepts full links and brand links", () => {
    expect(() => validateFlowDefinition({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["shop"] },
      conditions: [],
      actions: [
        { type: "send_link", text: "Our shop", url: "https://shop.example.in/products/kurta" },
        { type: "send_button", text: "On Amazon", buttonLabel: "Buy", url: "https://amzn.to/3xYz" },
      ],
    })).not.toThrow();
  });
});

describe("follow gate switched off", () => {
  it("accepts the blank follow-gate copy the builder sends when the gate is off", () => {
    const flow = validateFlowDefinition({
      ...campaign,
      followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" },
    });
    expect(flow).toMatchObject({ version: 2, followGate: { required: false, notFollowingMessage: "", recheckButtonLabel: "" } });
  });

  it("still requires the copy when the gate is on", () => {
    expect(() => validateFlowDefinition({
      ...campaign,
      followGate: { required: true, notFollowingMessage: "  ", recheckButtonLabel: "I've followed" },
    })).toThrow("Follow-gated campaigns need a not-following message");
  });
});
