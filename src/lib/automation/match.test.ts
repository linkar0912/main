import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowDefinition, FlowDefinitionV1, NormalizedEvent } from "./types";
import {
  compileRegexKeyword,
  evaluateTrigger,
  findMatchedKeyword,
  KEYWORD_MATCHER_CACHE_SIZE,
  keywordMatcherCacheSize,
  MAX_MATCH_TEXT_LENGTH,
  matchesTrigger,
  resolveReplyForMedia,
} from "./match";

const commentEvent: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "Please send the GUIDE",
  commentId: "comment_1",
  mediaId: "media_1",
  timestamp: 1,
};

describe("matchesTrigger", () => {
  it("matches comment keywords case-insensitively", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(true);
  });

  it("uses whole keyword phrases by default for existing workflows", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["free guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, { ...commentEvent, text: "Send the FREE   GUIDE, please" })).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "Read our free guidelines" })).toBe(false);
    expect(findMatchedKeyword("Send the FREE   GUIDE, please", ["free guide"])).toBe("free guide");
    expect(findMatchedKeyword("Read our free guidelines", ["free guide"])).toBeUndefined();
  });

  it("keeps explicit contains mode available for intentional substring matching", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "contains", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, { ...commentEvent, text: "guidelines" })).toBe(true);
    expect(findMatchedKeyword("guidelines", ["guide"], "contains")).toBe("guide");
  });

  it("matches any comment only on selected media when media IDs are present", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: ["media_1"] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, mediaId: "media_2" })).toBe(false);
  });

  it("does not apply message triggers to comments", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_text", text: "₹499" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(false);
  });

  it("honors the 'all' match mode and requires every keyword", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "all", keywords: ["guide", "please"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "send guide" })).toBe(false);
  });

  it("matches the 'exact' mode only when the entire comment equals the keyword", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "exact", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, { ...commentEvent, text: "guide" })).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "send guide" })).toBe(false);
  });

  it("supports regex mode and rejects invalid patterns safely", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "regex", keywords: ["^send .* guide$"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, { ...commentEvent, text: "send the guide" })).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "guide please" })).toBe(false);
    // Invalid regex - flow safely fails closed.
    const originalTrigger = flow.trigger;
    if (originalTrigger.type !== "comment") throw new Error("expected comment trigger");
    const broken: FlowDefinitionV1 = {
      ...flow,
      trigger: { ...originalTrigger, keywords: ["("] },
    };
    expect(matchesTrigger(broken, commentEvent)).toBe(false);
  });

  it("evaluates nested-quantifier regex patterns correctly without catastrophic backtracking", () => {
    const nestedQuantifier = "(a+)+$";
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "regex", keywords: [nestedQuantifier], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, { ...commentEvent, text: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!" })).toBe(false);
    expect(findMatchedKeyword("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!", [nestedQuantifier], "regex")).toBeUndefined();
    expect(matchesTrigger(flow, { ...commentEvent, text: "send aaaa" })).toBe(true);
    const safeGroup = "(ab)+$";
    expect(findMatchedKeyword("send ab", [safeGroup], "regex")).toBe(safeGroup);
    expect(findMatchedKeyword("send xy", [safeGroup], "regex")).toBeUndefined();
  });

  it("drops comments that match a negative keyword", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: {
        type: "comment",
        match: "keyword",
        keywords: ["guide"],
        mediaIds: [],
        negativeKeywords: ["scam"],
      },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "this is a scam, send the guide" })).toBe(false);
  });

  it("resolves the per-media reply override", () => {
    const trigger: FlowDefinition["trigger"] = {
      type: "comment",
      match: "keyword",
      keywords: ["guide"],
      mediaIds: [],
      replyPerMedia: { media_1: "Per-media reply" },
    };
    expect(resolveReplyForMedia(trigger, "media_1")).toBe("Per-media reply");
    expect(resolveReplyForMedia(trigger, "media_2")).toBeUndefined();
  });
});

function regexFlow(keywords: string[]): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "comment", match: "keyword", mode: "regex", keywords, mediaIds: [] },
    conditions: [],
    actions: [{ type: "private_reply", text: "Sent" }],
  };
}

describe("regex keywords on the linear-time engine", () => {
  const attack = `${"a".repeat(40)}!`;

  it.each([
    ["(a|a)+$", false],
    ["((a+))+$", false],
    ["(a+){2,}$", false],
    ["(.*a){12}$", false],
    ["(\\w|\\d)*$", true],
  ])("runs %s against 40 a's and a ! in under 50 ms", (pattern, expected) => {
    const started = performance.now();
    const matched = matchesTrigger(regexFlow([pattern]), { ...commentEvent, text: attack });
    const elapsed = performance.now() - started;
    expect(matched).toBe(expected);
    expect(elapsed).toBeLessThan(50);
  });

  it("keeps a worst-case pattern bounded on a maximum-length comment", () => {
    const comment = `${"a".repeat(MAX_MATCH_TEXT_LENGTH - 1)}!`;
    const started = performance.now();
    expect(matchesTrigger(regexFlow(["(a|a)+$", "(.*a){12}$", "((a+))+$"]), { ...commentEvent, text: comment })).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("agrees with JavaScript's case-insensitive regex on everyday patterns", () => {
    const patterns = [
      "^send .* guide$", "^size\\s*\\d+$", "price|cost", "\\bprice\\b", "colou?r", "a{2,3}b", "[a-z]+\\d",
      "[^a-z]", "[A-Z]{3}", "^\\w+@\\w+\\.com$", "\\d{3}-\\d{4}", "(?:foo|bar)baz", "(?<word>ab)c", "^$", "a.c",
      "[\\d-z]", "[]", "[^]", "\\x41", "café", "🔥+", "\\S+", "\\W", "[^\\W]", "(a|ab)(c|bcd)(d*)", "a+?b", "{", "a{x}",
      "^(yes|y|si)$", "^.{2,4}$", "\\$\\d+", "\\Bri",
    ];
    const texts = [
      "send the guide", "Size 42", "size?", "What's the PRICE", "prices", "colour", "aaab", "xyz9", "ABC", "john@mail.com",
      "555-1234", "barbaz", "abc", "", "a.c", "-", "Z", "Café", "CAFE", "this is 🔥🔥", "  ", "a\nb", "abcd", "{", "a{x}",
      "YES", "si", "$12", "string",
    ];
    for (const pattern of patterns) {
      const native = new RegExp(pattern, "i");
      const linear = compileRegexKeyword(pattern);
      expect(linear, pattern).not.toBeNull();
      for (const text of texts) {
        expect(linear?.(text), `${pattern} on ${JSON.stringify(text)}`).toBe(native.test(text));
      }
    }
  });

  it("never matches a pattern it cannot compile or one longer than 100 characters", () => {
    for (const pattern of ["(", "a**", "(?=a)a", "(?<!b)a", "(a)\\1", "\\p{L}", "a{2000}", "x{3,1}"]) {
      expect(compileRegexKeyword(pattern), pattern).toBeNull();
      expect(matchesTrigger(regexFlow([pattern]), { ...commentEvent, text: "aaa" }), pattern).toBe(false);
    }
    const hundred = "a".repeat(100);
    expect(matchesTrigger(regexFlow([hundred]), { ...commentEvent, text: hundred })).toBe(true);
    expect(matchesTrigger(regexFlow([`${hundred}a`]), { ...commentEvent, text: `${hundred}a` })).toBe(false);
  });

  it("caps regex work per event and still matches everyday patterns", () => {
    const comment = "please send me the course guide and price list ".repeat(50).slice(0, MAX_MATCH_TEXT_LENGTH);
    const heavy = Array.from({ length: 50 }, (_, index) => `.{0,${120 - index}}x`);
    const started = performance.now();
    expect(matchesTrigger(regexFlow(heavy), { ...commentEvent, id: "heavy_event", text: comment })).toBe(false);
    expect(performance.now() - started).toBeLessThan(1_000);

    const everyday = Array.from({ length: 49 }, (_, index) => `\\bmissing${index}\\b`).concat(["\\bprice list\\b"]);
    expect(evaluateTrigger(regexFlow(everyday), { ...commentEvent, id: "everyday_event", text: comment })).toEqual({
      matched: true,
      keyword: "\\bprice list\\b",
    });
  });

  // 90 arrows and math symbols: ordinary text is never in the class, so each
  // pattern keeps up to 199 states alive on every character.
  const symbols = Array.from({ length: 90 }, (_, index) => String.fromCharCode(0x2190 + index)).join("");

  it("bounds the total regex work of many automations on one event", () => {
    const flows = Array.from({ length: 20 }, (_, flowIndex) => regexFlow(Array.from({ length: 50 }, (_, index) => {
      const variant = flowIndex * 50 + index;
      return flowIndex % 2 === 0
        ? `[^${symbols.slice(0, 60 + (variant % 30))}]{${100 + (variant % 99)}}x`
        : `(?:\\b|\\B){${60 - (index % 10)}}x${variant}`;
    })));
    const dm = "hello please send me the price and the guide for the course thank you ".repeat(40);
    const event = { ...commentEvent, id: "many_automations", text: dm.slice(0, MAX_MATCH_TEXT_LENGTH) };
    const started = performance.now();
    for (const flow of flows) expect(matchesTrigger(flow, event)).toBe(false);
    // These patterns once cost about half a second per automation.
    expect(performance.now() - started).toBeLessThan(750);
  });

  it("charges the empty moves an NFA follows, not just its live states", () => {
    const test = compileRegexKeyword("(?:a?){50}z");
    const budget = { steps: 1e9 };
    expect(test?.("b".repeat(1_000), budget)).toBe(false);
    // Per character: 50 optional-a splits, 51 char states and their tests.
    expect(1e9 - budget.steps).toBeGreaterThan(120 * 1_000);
  });

  it("shares one budget across the automations checked against an event", () => {
    const comment = "please send me the course guide and price list ".repeat(50).slice(0, MAX_MATCH_TEXT_LENGTH);
    const everyday = regexFlow(["\\bprice list\\b"]);
    const heavy = regexFlow(Array.from({ length: 50 }, (_, index) => `[^${symbols}]{${199 - index}}x`));
    const event = { ...commentEvent, id: "shared_budget", text: comment };

    expect(matchesTrigger(everyday, event)).toBe(true);
    expect(matchesTrigger(heavy, event)).toBe(false);
    // A pattern already checked keeps its answer for the rest of the event (the
    // runner checks story-reply flows twice) ...
    expect(matchesTrigger(everyday, event)).toBe(true);
    // ... while a new pattern finds the budget spent ...
    expect(matchesTrigger(regexFlow(["\\bguide\\b"]), event)).toBe(false);
    // ... and the next event starts with a fresh budget.
    expect(matchesTrigger(regexFlow(["\\bguide\\b"]), { ...event, id: "next_event" })).toBe(true);
  });

  it("repeats groups that hold only assertions, as JavaScript does", () => {
    const patterns = ["(?:^)+send", "(\\b)*guide", "guide($){1,}", "(?:)+x", "(){0,1000}guide", "(?:\\b|\\B){60}s", "(?:^|\\b){2}g"];
    const texts = ["send the guide", "guide", "sending", "x", "a guide!", ""];
    for (const pattern of patterns) {
      const native = new RegExp(pattern, "i");
      const linear = compileRegexKeyword(pattern);
      expect(linear, pattern).not.toBeNull();
      for (const text of texts) {
        expect(linear?.(text), `${pattern} on ${JSON.stringify(text)}`).toBe(native.test(text));
      }
    }
    for (const pattern of ["^+", "\\b*", "${2}", "\\B?"]) {
      expect(() => new RegExp(pattern)).toThrow();
      expect(compileRegexKeyword(pattern), pattern).toBeNull();
    }
  });

  it("ignores case like JavaScript for letters with three or four case forms", () => {
    const patterns = ["[^ς]\\B", "[^µ]", "[σ]", "ς", "[ǅ]", "[^ǆ]", "ι", "[^ͅ]", "[θ]", "[α-ω]", "[^Α-Ω]", "\\u03c2"];
    const texts = ["Σ", "σ", "ς", "µ", "μ", "Μ", "Ǆ", "ǅ", "ǆ", "ͅ", "ι", "Ι", "ι", "ϑ", "Θ", "θ", "a"];
    for (const pattern of patterns) {
      const native = new RegExp(pattern, "i");
      const linear = compileRegexKeyword(pattern);
      for (const text of texts) {
        expect(linear?.(text), `${pattern} on ${JSON.stringify(text)}`).toBe(native.test(text));
      }
    }
  });
});

describe("keyword matching cost", () => {
  afterEach(() => vi.restoreAllMocks());

  it("only matches within the first 2,200 characters of the text", () => {
    const padding = "x ".repeat(MAX_MATCH_TEXT_LENGTH / 2);
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, { ...commentEvent, text: `${padding}guide` })).toBe(false);
    expect(matchesTrigger(flow, { ...commentEvent, text: `${padding.slice(0, -10)}guide` })).toBe(true);
    expect(matchesTrigger(regexFlow(["guide$"]), { ...commentEvent, text: `${padding}guide` })).toBe(false);
  });

  it("normalizes the event text once per event, not once per keyword", () => {
    const keywords = Array.from({ length: 50 }, (_, index) => `missing ${index}`);
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: {
        type: "comment",
        match: "keyword",
        mode: "all",
        keywords: ["guide", "please"],
        mediaIds: [],
        negativeKeywords: keywords,
      },
      conditions: [{ type: "contains_keyword", keywords: ["guide", ...keywords] }],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    // The first call compiles and caches each keyword's matcher.
    expect(matchesTrigger(flow, { ...commentEvent, text: "warm up the guide please" })).toBe(true);
    const normalize = vi.spyOn(String.prototype, "normalize");
    expect(matchesTrigger(flow, { ...commentEvent, text: "send the guide please" })).toBe(true);
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it("keeps the compiled matcher cache bounded", () => {
    for (let index = 0; index < KEYWORD_MATCHER_CACHE_SIZE + 500; index += 1) {
      findMatchedKeyword("send the guide", [`keyword ${index}`]);
    }
    expect(keywordMatcherCacheSize()).toBeLessThanOrEqual(KEYWORD_MATCHER_CACHE_SIZE);
    expect(findMatchedKeyword("send keyword 0 now", ["keyword 0"])).toBe("keyword 0");
  });
});

describe("evaluateTrigger", () => {
  it("returns the keyword the trigger matched so callers do not rescan", () => {
    const flow = (mode: "any" | "all" | "exact" | "contains" | "regex", keywords: string[]): FlowDefinitionV1 => ({
      version: 1,
      trigger: { type: "comment", match: "keyword", mode, keywords, mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    });
    expect(evaluateTrigger(flow("any", ["price", "guide"]), commentEvent)).toEqual({ matched: true, keyword: "guide" });
    expect(evaluateTrigger(flow("all", ["send", "guide"]), commentEvent)).toEqual({ matched: true, keyword: "send" });
    expect(evaluateTrigger(flow("contains", ["uid"]), commentEvent)).toEqual({ matched: true, keyword: "uid" });
    expect(evaluateTrigger(flow("exact", ["please send the guide"]), commentEvent))
      .toEqual({ matched: true, keyword: "please send the guide" });
    expect(evaluateTrigger(flow("regex", ["^nope", "GUIDE$"]), commentEvent)).toEqual({ matched: true, keyword: "GUIDE$" });
    expect(evaluateTrigger(flow("any", ["price"]), commentEvent)).toEqual({ matched: false });
  });

  it("reports no keyword for triggers that do not match on keywords", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(evaluateTrigger(flow, commentEvent)).toEqual({ matched: true });
  });
});
