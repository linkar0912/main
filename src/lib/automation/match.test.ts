import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger";
import type { FlowDefinition, FlowDefinitionV1, NormalizedEvent } from "./types";
import {
  compileRegexKeyword,
  describeRegexKeyword,
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

function keywordFlow(keywords: string[], extra: Partial<Extract<FlowDefinitionV1["trigger"], { type: "comment" }>> = {}): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "comment", match: "keyword", keywords, mediaIds: [], ...extra },
    conditions: [],
    actions: [{ type: "private_reply", text: "Sent" }],
  };
}

function messageFlow(keywords: string[], mode: "regex" | "any"): FlowDefinitionV1 {
  return {
    version: 1,
    trigger: { type: "message", match: "keyword", mode, keywords },
    conditions: [],
    actions: [{ type: "send_text", text: "Sent" }],
  };
}

const dmEvent: NormalizedEvent = {
  id: "dm_1",
  accountId: "ig_1",
  type: "message.received",
  text: "hello",
  recipientId: "person_1",
  timestamp: 1,
};

// 90 arrows and math symbols: ordinary text is never in the class, so each
// pattern keeps up to 199 states alive on every character.
const heavySymbols = Array.from({ length: 90 }, (_, index) => String.fromCharCode(0x2190 + index)).join("");
/** Regex keywords that spend a whole event's budget on a 2,200-character comment. */
const budgetSpender = regexFlow(Array.from({ length: 50 }, (_, index) => `[^${heavySymbols}]{${199 - index}}x`));
const longComment = "please send me the course guide and price list ".repeat(50).slice(0, MAX_MATCH_TEXT_LENGTH);

describe("one keyword budget per event for every match mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("checks a keyword repeated across automations once per event", () => {
    const indexOf = vi.spyOn(String.prototype, "indexOf");
    const includes = vi.spyOn(String.prototype, "includes");
    const event = { ...commentEvent, id: "repeated_keyword", text: "Can I get the brochure as a pdf?" };
    const anyFlow = keywordFlow(["brochure"]);
    const allFlow = keywordFlow(["brochure", "pdf"], { mode: "all" });
    const withCondition = { ...keywordFlow(["brochure"]), conditions: [{ type: "contains_keyword" as const, keywords: ["pdf"] }] };

    for (const flow of [anyFlow, allFlow, withCondition, anyFlow]) expect(matchesTrigger(flow, event)).toBe(true);
    // "all" shares the "any" results, and a contains check is remembered too.
    expect(indexOf.mock.calls.filter(([word]) => word === "brochure")).toHaveLength(1);
    expect(includes.mock.calls.filter(([word]) => word === "pdf")).toHaveLength(1);
  });

  it("rules out a phrase with a missing word before building or running its pattern", () => {
    const exec = vi.spyOn(RegExp.prototype, "exec");
    const ran = (word: string) => exec.mock.contexts.filter((pattern) => (pattern as RegExp).source.includes(word)).length;
    const event = { ...commentEvent, id: "prefilter", text: "send the guide" };

    expect(matchesTrigger(keywordFlow(["free yoga guide"]), event)).toBe(false);
    expect(ran("yoga")).toBe(0);
    // Every word is there but not as one phrase, so the pattern runs and says no.
    expect(matchesTrigger(keywordFlow(["guide send"]), event)).toBe(false);
    expect(ran("guide\\s+send")).toBe(1);
  });

  it("counts any-mode keywords as no match once the event's budget is spent", () => {
    const event = { ...commentEvent, id: "phrase_shared_budget", text: longComment };
    expect(matchesTrigger(keywordFlow(["price list"]), event)).toBe(true);
    expect(matchesTrigger(budgetSpender, event)).toBe(false);
    // Already checked: same answer for the rest of the event ...
    expect(matchesTrigger(keywordFlow(["price list"]), event)).toBe(true);
    // ... while a new phrase, or "all" keywords, find the budget spent ...
    expect(matchesTrigger(keywordFlow(["course guide"]), event)).toBe(false);
    expect(matchesTrigger(keywordFlow(["course", "list"], { mode: "all" }), event)).toBe(false);
    // ... and the next event starts with a fresh budget.
    expect(matchesTrigger(keywordFlow(["course guide"]), { ...event, id: "phrase_next_event" })).toBe(true);
  });

  it("still checks negative keywords, contains conditions and exact keywords after the budget is spent", () => {
    const event = { ...commentEvent, id: "spent_then_negative", text: `${longComment.slice(0, 2_000)} spam` };
    expect(matchesTrigger(budgetSpender, event)).toBe(false);
    const anyComment = (negativeKeywords: string[], conditions: FlowDefinitionV1["conditions"] = []): FlowDefinitionV1 => ({
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [], negativeKeywords },
      conditions,
      actions: [{ type: "private_reply", text: "Sent" }],
    });
    expect(matchesTrigger(anyComment(["spam"]), event)).toBe(false);
    expect(matchesTrigger(anyComment(["refund"]), event)).toBe(true);
    expect(matchesTrigger(anyComment([], [{ type: "contains_keyword", keywords: ["course"] }]), event)).toBe(true);
    expect(matchesTrigger(keywordFlow(["guide"], { mode: "contains" }), event)).toBe(true);
    expect(matchesTrigger(keywordFlow([event.text], { mode: "exact" }), event)).toBe(true);
  });

  it("keeps 100 automations of 50 maximum-length phrases on a 2,200-character comment well under 100 ms", () => {
    // 49 words, 97 characters, distinct per keyword: 36 a's, then a tail of
    // a's and b's with at least one b. Every word is in the comment, and each
    // phrase matches up to 36 words at every position before failing.
    const tail = (variant: number) => Array.from({ length: 13 }, (_, bit) => (((variant + 1) >> bit) & 1 ? "b" : "a")).join(" ");
    const flows = Array.from({ length: 100 }, (_, flowIndex) =>
      keywordFlow(Array.from({ length: 50 }, (_, index) => `${"a ".repeat(36)}${tail(flowIndex * 50 + index)}`)));
    const comment = `b ${"a ".repeat(1_099)}`;
    expect(comment).toHaveLength(MAX_MATCH_TEXT_LENGTH);
    expect(flows[99].trigger.type === "comment" && flows[99].trigger.keywords[49]).toHaveLength(97);

    // Worker time is CPU time: on a busy test machine the wall clock also
    // counts the time this process waits for a core.
    const cpuTimes: number[] = [];
    const wallTimes: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      const event = { ...commentEvent, id: `phrase_worst_case_${run}`, text: comment };
      const cpuStart = process.cpuUsage();
      const started = performance.now();
      const matched = flows.filter((flow) => matchesTrigger(flow, event)).length;
      wallTimes.push(performance.now() - started);
      const cpu = process.cpuUsage(cpuStart);
      cpuTimes.push((cpu.user + cpu.system) / 1_000);
      expect(matched).toBe(0);
    }
    // Without the budget each event took about 1.5 s on a laptop.
    expect(Math.min(...cpuTimes)).toBeLessThan(100);
    expect(Math.min(...wallTimes)).toBeLessThan(1_000);
  });

  it("logs one warning per event that spends its budget, with how many checks it skipped", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const forEvent = (eventId: string) => warn.mock.calls.filter(([, context]) => context?.eventId === eventId);
    const event = { ...commentEvent, id: "budget_warning", text: longComment };

    expect(matchesTrigger(budgetSpender, event)).toBe(false);
    expect(matchesTrigger(regexFlow(["\\bguide\\b"]), event)).toBe(false);
    expect(matchesTrigger(keywordFlow(["course guide"]), event)).toBe(false);
    expect(forEvent("budget_warning")).toHaveLength(0);
    vi.advanceTimersByTime(1_000);

    const calls = forEvent("budget_warning");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ eventId: "budget_warning" });
    // At least the two checks after the spend, plus the spender's own unfinished ones.
    expect(Number(calls[0][1]?.skippedKeywordChecks)).toBeGreaterThanOrEqual(2);

    expect(matchesTrigger(regexFlow(["\\bprice\\b"]), event)).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(forEvent("budget_warning")).toHaveLength(1);
  });
});

describe("the 2,200-character cut", () => {
  it("stops reading at the cut but checks $ and \\b against the real text", () => {
    const text = `${"x".repeat(2_197)}buy${"y".repeat(330)}`;
    expect(text).toHaveLength(2_530);
    const event = { ...dmEvent, id: "long_dm", text };
    expect(matchesTrigger(messageFlow(["buy$"], "regex"), event)).toBe(false);
    expect(matchesTrigger(messageFlow(["buy\\b"], "regex"), event)).toBe(false);
    expect(matchesTrigger(messageFlow(["buy"], "regex"), event)).toBe(true);

    // "buy" ends at the cut and a space follows it, past the cut: a real word boundary.
    const spaced = { ...event, id: "long_dm_spaced", text: `${"x".repeat(2_196)} buy ${"later ".repeat(60)}` };
    expect(spaced.text.slice(2_197, 2_200)).toBe("buy");
    expect(matchesTrigger(messageFlow(["\\bbuy\\b"], "regex"), spaced)).toBe(true);
    expect(matchesTrigger(messageFlow(["buy$"], "regex"), spaced)).toBe(false);
    expect(matchesTrigger(messageFlow(["later$"], "regex"), spaced)).toBe(false);
  });

  it("counts the cut in characters a person sees, so an emoji is one", () => {
    const text = `${"🔥".repeat(1_100)} link`;
    expect(text.length).toBeGreaterThan(MAX_MATCH_TEXT_LENGTH);
    const event = { ...commentEvent, id: "emoji_comment", text };
    expect(matchesTrigger(regexFlow(["\\blink\\b"]), event)).toBe(true);
    expect(matchesTrigger(keywordFlow(["link"]), event)).toBe(true);
    expect(findMatchedKeyword(text, ["link"])).toBe("link");
    // The 2,201st character is past the cut, whatever its width.
    const past = `${"🔥".repeat(MAX_MATCH_TEXT_LENGTH)}link`;
    expect(matchesTrigger(regexFlow(["link"]), { ...event, id: "emoji_past_cut", text: past })).toBe(false);
    expect(findMatchedKeyword(past, ["link"], "contains")).toBeUndefined();
  });
});

describe("regex keywords the engine refuses", () => {
  it("says why a pattern cannot run", () => {
    const reasons: Array<[string, ReturnType<typeof describeRegexKeyword>]> = [
      ["price", null],
      ["(?<a>x)(?<b>y)", null],
      ["(", "syntax"],
      ["x{3,1}", "syntax"],
      ["(?<1>x)", "syntax"],
      ["(?P<name>x)", "syntax"],
      ["(?=a)a", "lookaround"],
      ["(?!spam).*price", "lookaround"],
      ["(?<!not )interested", "lookaround"],
      ["(?<=x)y", "lookaround"],
      ["(ha)\\1", "backreference"],
      ["(?<a>x)\\k<a>", "backreference"],
      ["(?i)link", "inline_flags"],
      ["(?i:link)", "inline_flags"],
      ["(?-i:link)", "inline_flags"],
      ["\\p{L}+", "unsupported_escape"],
      ["\\cJ", "unsupported_escape"],
      ["\\01", "unsupported_escape"],
      ["a{2000}", "too_large"],
      ["price.{0,150}", "too_large"],
      ["(price|cost|rate|kitna|how much){1,10}", "too_large"],
      ["(?<a>x)(?<a>y)", "duplicate_name"],
      ["(?<a>x)|(?<a>y)", "duplicate_name"],
      ["a".repeat(101), "too_long"],
    ];
    for (const [pattern, reason] of reasons) {
      expect(describeRegexKeyword(pattern), pattern).toBe(reason);
      expect(compileRegexKeyword(pattern) === null, pattern).toBe(reason !== null);
    }
  });

  it("refuses two groups with one name, which JavaScript rejects too", () => {
    expect(() => new RegExp("(?<a>x)(?<a>y)")).toThrow();
    expect(compileRegexKeyword("(?<a>x)(?<a>y)")).toBeNull();
    expect(matchesTrigger(regexFlow(["(?<a>x)(?<a>y)"]), { ...commentEvent, id: "duplicate_names", text: "xy" })).toBe(false);
  });

  it("reports a trigger that missed because a saved pattern cannot run", () => {
    const event = { ...commentEvent, id: "legacy_trigger", text: "I am interested!" };
    expect(evaluateTrigger(regexFlow(["(?<!not )interested"]), event)).toEqual({ matched: false, unsupportedPattern: true });
    expect(evaluateTrigger(regexFlow(["^price", "a".repeat(120)]), event)).toEqual({ matched: false, unsupportedPattern: true });
    expect(evaluateTrigger(regexFlow(["(?<!not )interested", "interested!$"]), event))
      .toEqual({ matched: true, keyword: "interested!$" });
    expect(evaluateTrigger(regexFlow(["^price"]), event)).toEqual({ matched: false });
    // Not a regex trigger, or nothing to read: an ordinary miss.
    expect(evaluateTrigger(keywordFlow(["(?<!not )interested"]), event)).toEqual({ matched: false });
    expect(evaluateTrigger(regexFlow(["(?<!not )interested"]), { ...event, text: "" })).toEqual({ matched: false });
  });

  it("warns once per automation per process, naming the automation but not the pattern", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const flow = regexFlow(["^ok$", "(?<!never )unsupported-once"]);
      for (const id of ["legacy_a", "legacy_b", "legacy_c"]) {
        evaluateTrigger(flow, { ...commentEvent, id, text: "unsupported-once" }, { automationId: "automation_legacy_1" });
      }
      evaluateTrigger(flow, { ...commentEvent, id: "legacy_d", text: "nope" }, { automationId: "automation_legacy_2" });
      const legacyCalls = warn.mock.calls.filter(([, context]) => String(context?.automationId).startsWith("automation_legacy_"));
      expect(legacyCalls.map(([, context]) => context?.automationId)).toEqual(["automation_legacy_1", "automation_legacy_2"]);
      expect(legacyCalls[0][1]).toMatchObject({ accountId: "ig_1", triggerType: "comment", keywordIndexes: [1] });
      expect(JSON.stringify(legacyCalls)).not.toContain("unsupported-once");

      // Without an id, the account and keyword list stand in for the automation.
      const anonymous = regexFlow(["(?<!never )anonymous-legacy"]);
      evaluateTrigger(anonymous, { ...commentEvent, id: "legacy_e", text: "x" });
      evaluateTrigger(anonymous, { ...commentEvent, id: "legacy_f", text: "y" });
      expect(warn.mock.calls.filter(([, context]) => context?.automationId === undefined && context?.triggerType === "comment"))
        .toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});
