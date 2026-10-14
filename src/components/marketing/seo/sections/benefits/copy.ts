import type { SeoPage, SeoTopic } from "@/src/content/seo";
import { topicLine } from "../../seo-theme";

/** The mono eyebrow every benefits variant shares. */
export const benefitsEyebrow = "Why it helps";

/* The topic's first line, for callers that only know the topic. */
const firstLines: Record<SeoTopic, string> = {
  comments: "Busy comment sections, calm replies.",
  messages: "Built for the inbox you actually have.",
  stories: "Built for the way people answer Stories.",
  leads: "Built for the details you need next.",
  followers: "Built for a follower rule people can trust.",
  team: "Built for a calm, accountable inbox.",
  insights: "Built for decisions you can explain.",
  facebook: "Built for comment sections people read.",
};

/**
 * The benefits headline. Pass the page: it gets one of its topic's three lines,
 * seeded like the overview headline, so pages on one topic stop repeating the
 * same heading. A bare topic still works and returns the topic's first line.
 */
export function benefitsTitle(subject: SeoPage | SeoTopic): string {
  return typeof subject === "string" ? firstLines[subject] : topicLine(subject, "benefitsTitles");
}

/** One real sentence under the headline, per topic. */
const subs: Record<SeoTopic, string> = {
  comments: "Each comment gets the answer its post promised, without anyone searching your bio for it.",
  messages: "Prepared answers for the questions you already know, and a clear route to your team for the rest.",
  stories: "Story replies and mentions get a fitting answer while the moment is still fresh.",
  leads: "Collect only what helps, and keep it beside the conversation it came from.",
  followers: "A follower rule people can see upfront, and a delivery that keeps its word.",
  team: "Automation covers the routine part and steps aside when a person should answer.",
  insights: "Read what happened after each reply, one stage at a time.",
  facebook: "Public answers that help the person who asked and everyone else reading the thread.",
};

export function benefitsSub(topic: SeoTopic): string {
  return subs[topic];
}
