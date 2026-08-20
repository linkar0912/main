import { matchesTrigger } from "./match";
import type { EvaluationResult, ExecutionAction, FlowDefinition, NormalizedEvent } from "./types";

export function evaluateFlow(flow: FlowDefinition, event: NormalizedEvent): EvaluationResult {
  if (!matchesTrigger(flow, event)) {
    return { status: "skipped", reason: "trigger did not match", actions: [] };
  }

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

  return { status: "matched", actions };
}
