import { describe, expect, it, vi } from "vitest";

import { checkRegexKeywords, findUnsupportedRegexKeywords, formatProblem, type AutomationRow } from "./check-regex-keywords";

function regexAutomation(id: string, keywords: unknown[], trigger: Record<string, unknown> = {}): AutomationRow {
  return {
    id,
    workspaceId: `workspace_${id}`,
    definition: {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "regex", keywords, mediaIds: [], ...trigger },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here you go" }],
    },
  };
}

describe("findUnsupportedRegexKeywords", () => {
  it("lists each regex keyword the matcher cannot run, with its index and reason", () => {
    const problems = findUnsupportedRegexKeywords([
      regexAutomation("lookbehind", ["price", "(?<!not )interested", "  ", "(ha)\\1"]),
      regexAutomation("long", ["a".repeat(101)]),
      regexAutomation("dm", ["(?i)link"], { type: "message" }),
      regexAutomation("story", ["price.{0,150}"], { type: "story_reply" }),
      regexAutomation("fine", ["^size\\s*\\d+$", " price "]),
    ]);
    expect(problems).toEqual([
      { workspaceId: "workspace_lookbehind", automationId: "lookbehind", keywordIndex: 1, reason: "lookaround" },
      { workspaceId: "workspace_lookbehind", automationId: "lookbehind", keywordIndex: 3, reason: "backreference" },
      { workspaceId: "workspace_long", automationId: "long", keywordIndex: 0, reason: "too_long" },
      { workspaceId: "workspace_dm", automationId: "dm", keywordIndex: 0, reason: "inline_flags" },
      { workspaceId: "workspace_story", automationId: "story", keywordIndex: 0, reason: "too_large" },
    ]);
  });

  it("ignores keywords the matcher never runs as regex, and malformed definitions", () => {
    expect(findUnsupportedRegexKeywords([
      regexAutomation("any-mode", ["(?<!not )interested"], { mode: "any" }),
      regexAutomation("no-mode", ["(?<!not )interested"], { mode: undefined }),
      regexAutomation("any-comment", ["(?<!not )interested"], { match: "any" }),
      regexAutomation("referral", ["(?<!not )interested"], { type: "referral" }),
      regexAutomation("not-strings", [42, null, { pattern: "(" }]),
      { id: "campaign", workspaceId: "w", definition: { version: 2, trigger: { type: "comment", keywords: ["(?=x)"] } } },
      { id: "null", workspaceId: "w", definition: null },
      { id: "string", workspaceId: "w", definition: "not json" },
      { id: "no-trigger", workspaceId: "w", definition: { version: 1 } },
      { id: "keywords-object", workspaceId: "w", definition: { version: 1, trigger: { type: "comment", match: "keyword", mode: "regex", keywords: { 0: "(" } } } },
    ])).toEqual([]);
  });

  it("prints the place and reason but never the pattern text", () => {
    const [problem] = findUnsupportedRegexKeywords([regexAutomation("secret", ["(?<!private words )x"])]);
    const line = formatProblem(problem);
    expect(line).toBe("workspace=workspace_secret automation=secret keyword=0 reason=lookaround");
    expect(line).not.toContain("private words");
  });
});

describe("checkRegexKeywords", () => {
  it("pages through ACTIVE automations by id and reports what it found", async () => {
    const rows = [
      regexAutomation("a1", ["price"]),
      regexAutomation("a2", ["(?=x)y"]),
      regexAutomation("a3", ["fine"]),
      regexAutomation("a4", ["(", "ok"]),
      regexAutomation("a5", ["ok"]),
    ];
    const findMany = vi.fn(async ({ take, cursor, skip }: { take: number; cursor?: { id: string }; skip?: number }) => {
      const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + (skip ?? 0) : 0;
      return rows.slice(start, start + take);
    });
    const lines: string[] = [];

    const result = await checkRegexKeywords({ prisma: { automation: { findMany } }, pageSize: 2, write: (line) => lines.push(line) });

    expect(result.scanned).toBe(5);
    expect(result.problems.map((problem) => [problem.automationId, problem.keywordIndex, problem.reason]))
      .toEqual([["a2", 0, "lookaround"], ["a4", 0, "syntax"]]);
    expect(lines).toEqual([
      "workspace=workspace_a2 automation=a2 keyword=0 reason=lookaround",
      "workspace=workspace_a4 automation=a4 keyword=0 reason=syntax",
      "Checked 5 active automations: 2 regex keywords the matcher cannot run.",
    ]);
    expect(findMany).toHaveBeenCalledTimes(3);
    for (const [args] of findMany.mock.calls) {
      expect(args).toMatchObject({
        where: { status: "ACTIVE", archivedAt: null },
        select: { id: true, workspaceId: true, definition: true },
        orderBy: { id: "asc" },
        take: 2,
      });
    }
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "a2" }, skip: 1 });
  });

  it("reports nothing to fix when every regex keyword runs", async () => {
    const findMany = vi.fn(async () => [regexAutomation("ok", ["price|cost"])]);
    const lines: string[] = [];
    const result = await checkRegexKeywords({ prisma: { automation: { findMany } }, write: (line) => lines.push(line) });
    expect(result.problems).toEqual([]);
    expect(lines).toEqual(["Checked 1 active automations: 0 regex keywords the matcher cannot run."]);
  });
});
