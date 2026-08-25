import type { FlowDefinition, FlowDefinitionV1, NormalizedEvent } from "./types";
import { PERSONALIZATION_TOKENS } from "./types";
import { evaluateFlow } from "./engine";
import { matchCampaign } from "./campaign-match";
import { renderTemplate } from "./send-limits";

export type ValidationIssue = {
  severity: "error" | "warning";
  message: string;
};

export type SimulationActionPlan = {
  type: string;
  summary: string;
};

export type SimulationResult =
  | { matched: true; actions: SimulationActionPlan[]; matchedKeyword?: string }
  | { matched: false; reason: string };

const KNOWN_TOKENS = new Set(PERSONALIZATION_TOKENS.map((token) => token.slice(1, -1)));

function collectTokenTypos(text: string): string[] {
  const unknown: string[] = [];
  for (const match of text.matchAll(/\{([a-zA-Z_]+)\}/g)) {
    if (!KNOWN_TOKENS.has(match[1]) && !unknown.includes(match[1])) unknown.push(match[1]);
  }
  return unknown;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Semantic checks that go beyond the schema-level validateFlowDefinition:
 * combinations that parse fine but can never fire (or silently misbehave).
 */
export function validateFlowSemantics(definition: FlowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const texts: string[] = [];

  if (definition.version === 1) {
    const flow = definition;
    if (flow.trigger.type !== "comment" && flow.actions.some((action) => action.type === "private_reply")) {
      issues.push({ severity: "error", message: "Private replies only work on comment triggers - this action can never be delivered." });
    }
    if ((flow.trigger.type === "comment" || flow.trigger.type === "message") && flow.trigger.match === "keyword" && flow.trigger.keywords.length === 0) {
      issues.push({ severity: "error", message: "Keyword matching is selected but no keywords are set - the flow will never fire." });
    }
    if (flow.emailCapture && flow.trigger.type === "comment") {
      issues.push({ severity: "error", message: "Email capture requires a DM-side trigger (message, referral, story mention, ...)." });
    }
    if (flow.followUps?.length && flow.trigger.type === "comment") {
      issues.push({ severity: "error", message: "Timed follow-ups require a DM-side trigger; they cannot be scheduled from comments." });
    }
    for (const action of flow.actions) {
      if (action.type === "private_reply" || action.type === "send_text" || action.type === "send_link" || action.type === "send_button" || action.type === "quick_replies") {
        texts.push(action.text);
      } else if (action.caption) {
        texts.push(action.caption);
      }
      if ((action.type === "send_link" || action.type === "send_button") && !isValidHttpUrl(action.url)) {
        issues.push({ severity: "error", message: `"${action.url}" is not a valid http(s) URL.` });
      }
      if (action.type === "quick_replies") {
        const replies = action.replies.filter((reply) => reply.trim().length > 0);
        if (replies.length === 0) {
          issues.push({ severity: "error", message: "Quick-reply actions need at least one reply chip." });
        }
        for (const reply of replies.slice(0, 4)) {
          if (reply.trim().length > 20) {
            issues.push({ severity: "warning", message: `Quick reply "${reply.trim()}" exceeds Instagram's 20-character chip limit and will be truncated.` });
          }
        }
      }
    }
  } else {
    texts.push(definition.openingMessage.text, definition.delivery.text);
    if (!isValidHttpUrl(definition.delivery.url)) {
      issues.push({ severity: "error", message: `"${definition.delivery.url}" is not a valid http(s) delivery link.` });
    }
  }

  for (const text of texts) {
    for (const typo of collectTokenTypos(text)) {
      issues.push({
        severity: "warning",
        message: `{${typo}} is not a known personalization token - it will be sent literally. Valid tokens: ${[...KNOWN_TOKENS].map((t) => `{${t}}`).join(", ")}.`,
      });
    }
  }

  return issues;
}

function buildTemplateVars(event: NormalizedEvent, matchedKeyword?: string): Record<string, string | undefined> {
  return {
    username: event.senderUsername ?? "there",
    ...(matchedKeyword ? { keyword: matchedKeyword } : {}),
    ...(event.mediaId ? { media: "your post" } : {}),
  };
}

// Deterministic stand-in for the campaign's hash-picked public reply so simulations are stable.
function selectPublicReplyForSimulation(replies: string[], seed: string): string | undefined {
  if (replies.length === 0) return undefined;
  return replies[seed.length % replies.length];
}

/** Dry-runs a definition against a sample event without touching Meta or storage. */
export function simulateDefinition(
  definition: FlowDefinition,
  sampleEvent: Omit<NormalizedEvent, "id" | "timestamp"> & Partial<Pick<NormalizedEvent, "id" | "timestamp">>,
): SimulationResult {
  const event: NormalizedEvent = {
    id: sampleEvent.id ?? "simulate_1",
    timestamp: sampleEvent.timestamp ?? Date.now(),
    ...sampleEvent,
  } as NormalizedEvent;

  if (definition.version === 2) {
    const match = matchCampaign(definition, event);
    if (!match.matched) return { matched: false, reason: match.reason };
    const vars = buildTemplateVars(event, match.keyword);
    const actions: SimulationActionPlan[] = [];
    const publicReply = selectPublicReplyForSimulation(definition.publicReplies, event.id);
    if (publicReply) {
      actions.push({ type: "public_reply", summary: `Public comment reply: "${renderTemplate(publicReply, vars).slice(0, 140)}"` });
    }
    actions.push({
      type: "opening_message",
      summary: `Opening DM with "${definition.openingMessage.optInButtonLabel}" button: "${renderTemplate(definition.openingMessage.text, vars).slice(0, 140)}"`,
    });
    actions.push({
      type: "delivery",
      summary: definition.followGate.required
        ? `Delivery link after opt-in + follow check: ${definition.delivery.url}`
        : `Delivery link right after opt-in: ${definition.delivery.url}`,
    });
    return { matched: true, actions, ...(match.keyword ? { matchedKeyword: match.keyword } : {}) };
  }

  const result = evaluateFlow(definition as FlowDefinitionV1, event, { isNewContact: true });
  if (result.status === "skipped") {
    return { matched: false, reason: result.reason };
  }
  const vars = buildTemplateVars(event, result.matchedKeyword);
  const actions = result.actions.map((action) => {
    switch (action.type) {
      case "private_reply":
        return { type: "private_reply", summary: `Private reply to comment: "${renderTemplate(action.text, vars).slice(0, 140)}"` };
      case "send_text":
        return { type: "send_text", summary: `DM: "${renderTemplate(action.text, vars).slice(0, 140)}"` };
      case "send_link":
        return { type: "send_link", summary: `DM with link (${action.url}): "${renderTemplate(action.text, vars).slice(0, 100)}"` };
      case "send_button":
        return { type: "send_button", summary: `DM with "${renderTemplate(action.buttonLabel, vars)}" button → ${action.url}` };
      case "send_image":
        return { type: "send_image", summary: `Image DM: ${action.imageUrl}` };
      case "quick_replies":
        return {
          type: "quick_replies",
          summary: `DM with quick replies [${action.replies.map((reply) => renderTemplate(reply, vars)).join(" | ")}]: "${renderTemplate(action.text, vars).slice(0, 100)}"`,
        };
    }
  });
  return { matched: true, actions, ...(result.matchedKeyword ? { matchedKeyword: result.matchedKeyword } : {}) };
}
