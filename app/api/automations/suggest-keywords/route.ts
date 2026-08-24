import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";

export const runtime = "nodejs";

// Stopwords and generic chatter that never make useful triggers.
const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "this", "that", "have", "are",
  "was", "but", "not", "can", "all", "will", "one", "out", "how", "what",
  "when", "why", "who", "pls", "plz", "please", "hey", "hi", "hello", "ok",
  "bro", "sir", "mam", "maam", "bhai", "did", "does", "yes", "lol", "nice",
  "good", "great", "love", "want", "need", "give", "tell", "send", "know",
  "from", "they", "them", "there", "here", "just", "like", "get", "got",
]);

const CURATED_SUGGESTIONS = [
  "price", "rates", "link", "shop", "buy", "guide", "menu", "offer",
  "discount", "collab", "details", "stock", "size", "booking",
];

function normalizeWord(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Keyword ideas for trigger inputs: keywords already working in this
 * workspace's automations first (they match the account's actual audience),
 * then curated high-intent staples for creators and D2C sellers. Comment-text
 * mining lands when webhook payloads are persisted - until then suggestions
 * stay honest instead of pretending to read history we do not store.
 */
export async function suggestKeywords(
  listAutomations: ReturnType<typeof getRepository>["listAutomations"],
  workspaceId: string,
): Promise<string[]> {
  const automations = await listAutomations(workspaceId);
  const counts = new Map<string, number>();
  for (const automation of automations) {
    if (automation.definition.version !== 1) continue;
    const sources = automation.definition.trigger.type === "comment" || automation.definition.trigger.type === "message"
      ? [
          ...automation.definition.trigger.keywords,
          ...automation.definition.conditions.flatMap((condition) =>
            condition.type === "contains_keyword" ? condition.keywords : []),
        ]
      : [];
    for (const keyword of sources) {
      const normalized = normalizeWord(keyword);
      if (normalized.length < 3 || STOPWORDS.has(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([keyword]) => keyword)
    .slice(0, 6);
  return [...new Set([...ranked, ...CURATED_SUGGESTIONS])].slice(0, 10);
}

// GET /api/automations/suggest-keywords - keyword ideas for the builder.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: await suggestKeywords(getRepository().listAutomations, session.workspaceId) });
}
