import { matchesTrigger, findMatchedKeyword } from "./match";
import type { EvaluationContext, EvaluationResult, ExecutionAction, FlowDefinitionV1, NormalizedEvent } from "./types";
import { withinSchedule } from "./types";

export function evaluateFlow(
  flow: FlowDefinitionV1,
  event: NormalizedEvent,
  context: EvaluationContext = {},
): EvaluationResult {
  if (!withinSchedule(flow.schedule, new Date(event.timestamp))) {
    return { status: "skipped", reason: "outside scheduled window", actions: [] };
  }

  if (!matchesTrigger(flow, event, context)) {
    return { status: "skipped", reason: "trigger did not match", actions: [] };
  }

  if (flow.trigger.type === "comment" && flow.actions.some((action) => action.type !== "private_reply")) {
    return { status: "skipped", reason: "comment triggers support only a private reply", actions: [] };
  }

  const matchedKeyword =
    (flow.trigger.type === "comment" || flow.trigger.type === "message") && flow.trigger.match === "keyword"
      ? findMatchedKeyword(event.text, flow.trigger.keywords)
      : undefined;

  const actions: ExecutionAction[] = [];
  let privateReplyAdded = false;

  for (const action of flow.actions) {
    if (action.type === "private_reply") {
      if (!event.commentId) {
        return { status: "skipped", reason: "private reply action requires a comment ID", actions: [] };
      }
      if (!privateReplyAdded) {
        actions.push({ type: "private_reply", commentId: event.commentId, text: action.text });
        privateReplyAdded = true;
      }
      continue;
    }

    if (!event.recipientId) {
      return { status: "skipped", reason: "message action requires a recipient ID", actions: [] };
    }

    if (action.type === "send_text") {
      actions.push({ type: "send_text", recipientId: event.recipientId, text: action.text });
    } else if (action.type === "send_link") {
      actions.push({ type: "send_link", recipientId: event.recipientId, text: action.text, url: action.url });
    } else if (action.type === "send_image") {
      // Meta's image attachment carries no caption field, so an optional caption
      // expands into its own text message right after the image.
      actions.push({ type: "send_image", recipientId: event.recipientId, imageUrl: action.imageUrl });
      if (action.caption) {
        actions.push({ type: "send_text", recipientId: event.recipientId, text: action.caption });
      }
    } else if (action.type === "quick_replies") {
      const replies = action.replies.map((reply) => reply.trim()).filter(Boolean).slice(0, 4);
      if (replies.length > 0) {
        actions.push({ type: "quick_replies", recipientId: event.recipientId, text: action.text, replies });
      }
    } else {
      actions.push({
        type: "send_button",
        recipientId: event.recipientId,
        text: action.text,
        buttonLabel: action.buttonLabel,
        url: action.url,
      });
    }
  }

  return { status: "matched", actions, ...(matchedKeyword ? { matchedKeyword } : {}) };
}
