/**
 * Lists switched-on regex automations whose keywords the matcher cannot run.
 *
 * Automations saved before the linear-time regex engine may hold a keyword it
 * refuses (a lookaround, a backreference, a pattern over 100 characters, ...).
 * They keep running but never match until the pattern is fixed, and their
 * skips read "regex pattern not supported". This prints one line per such
 * keyword (workspace, automation, keyword index and reason, never the pattern
 * text) and exits 1 when it finds any, so the owner can reach those customers.
 *
 * Read only: it runs a single paged SELECT over ACTIVE automations.
 *
 *   DATABASE_URL=... pnpm check:regex-keywords
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { describeRegexKeyword, type RegexRefusalReason } from "../src/lib/automation/match";

export type AutomationRow = { id: string; workspaceId: string; definition: unknown };

export type RegexKeywordProblem = {
  workspaceId: string;
  automationId: string;
  keywordIndex: number;
  reason: RegexRefusalReason;
};

const KEYWORD_TRIGGER_TYPES = new Set(["comment", "message", "story_reply"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The regex keywords in these automations that the matcher cannot run. Only
 * keyword triggers in regex mode count: an "any comment" or "any message"
 * trigger never reads its keywords. Blank entries are skipped, as the matcher
 * skips them, and every other entry is checked trimmed, as it runs.
 */
export function findUnsupportedRegexKeywords(rows: Iterable<AutomationRow>): RegexKeywordProblem[] {
  const problems: RegexKeywordProblem[] = [];
  for (const row of rows) {
    const definition = row.definition;
    if (!isRecord(definition) || definition.version !== 1 || !isRecord(definition.trigger)) continue;
    const trigger = definition.trigger;
    if (!KEYWORD_TRIGGER_TYPES.has(String(trigger.type))) continue;
    if (trigger.mode !== "regex" || trigger.match !== "keyword" || !Array.isArray(trigger.keywords)) continue;
    trigger.keywords.forEach((keyword: unknown, keywordIndex) => {
      if (typeof keyword !== "string") return;
      const pattern = keyword.trim();
      if (!pattern) return;
      const reason = describeRegexKeyword(pattern);
      if (reason) problems.push({ workspaceId: row.workspaceId, automationId: row.id, keywordIndex, reason });
    });
  }
  return problems;
}

export function formatProblem(problem: RegexKeywordProblem): string {
  return `workspace=${problem.workspaceId} automation=${problem.automationId} keyword=${problem.keywordIndex} reason=${problem.reason}`;
}

type AutomationReader = {
  automation: {
    findMany(args: {
      where: { status: "ACTIVE"; archivedAt: null };
      select: { id: true; workspaceId: true; definition: true };
      orderBy: { id: "asc" };
      take: number;
      cursor?: { id: string };
      skip?: number;
    }): Promise<AutomationRow[]>;
  };
};

/** Pages through ACTIVE automations and reports every regex keyword that cannot run. */
export async function checkRegexKeywords({
  prisma,
  pageSize = 500,
  write = (line: string) => process.stdout.write(`${line}\n`),
}: {
  prisma: AutomationReader;
  pageSize?: number;
  write?: (line: string) => void;
}): Promise<{ scanned: number; problems: RegexKeywordProblem[] }> {
  const problems: RegexKeywordProblem[] = [];
  let scanned = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.automation.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      select: { id: true, workspaceId: true, definition: true },
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    scanned += page.length;
    for (const problem of findUnsupportedRegexKeywords(page)) {
      problems.push(problem);
      write(formatProblem(problem));
    }
    if (page.length < pageSize) break;
    cursor = page[page.length - 1].id;
  }
  write(`Checked ${scanned} active automations: ${problems.length} regex keywords the matcher cannot run.`);
  return { scanned, problems };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const { problems } = await checkRegexKeywords({ prisma });
    process.exitCode = problems.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
