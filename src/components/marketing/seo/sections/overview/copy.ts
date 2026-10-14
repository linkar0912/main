import type { SeoPage, SeoTopic } from "@/src/content/seo";
import { exampleHandle, incomingFor } from "../../seo-example";

/** Sentences end at . ! or ? (and a closing quote) before a capital, a digit or an opening quote. */
export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?][’”"]?)\s+(?=[A-Z0-9‘“"])/);
}

/** The first sentence leads; the rest of the intro follows in body size. */
export function splitLead(text: string): readonly [lead: string, rest: string] {
  const [lead, ...rest] = splitSentences(text);
  return [lead, rest.join(" ")];
}

export const overviewCta = "Create your first reply";

/*
 * Other things people send on each topic, for the statement's request chips.
 * Short, plausible and written as typed; the page's own request always comes
 * first and any line that repeats it is skipped.
 */
const topicRequests: Record<SeoTopic, readonly string[]> = {
  comments: ["Link please!", "How do I get this?", "Is this still available?"],
  messages: ["Where can I book?", "Do you deliver here?", "Is this in stock?"],
  stories: ["Where is this from?", "Is the offer still on?", "Link please!"],
  leads: ["Can I get the details?", "What are the timings?", "How do I sign up?"],
  followers: ["Just followed. Can I get it?", "Is it free?", "Sent you a follow!"],
  team: ["Can I talk to someone?", "My order hasn’t arrived", "I need to change my booking"],
  insights: ["Send the link please", "Is this still open?", "How do I join?"],
  facebook: ["What are your hours?", "Do you deliver?", "Is this in stock?"],
};

export type RequestChip = { handle: string; text: string; event: boolean };

/** Three requests: the page's own first (an event reads as a status line), then two from the topic. */
export function requestChips(page: SeoPage): readonly RequestChip[] {
  const incoming = incomingFor(page);
  const first: RequestChip = { handle: exampleHandle(page, 1), text: incoming.text, event: incoming.kind === "event" };
  const seen = incoming.text.trim().toLowerCase();
  const others = topicRequests[page.topic].filter((text) => text.toLowerCase() !== seen).slice(0, 2);
  return [first, ...others.map((text, index) => ({ handle: exampleHandle(page, index + 2), text, event: false }))];
}
