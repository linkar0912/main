export type CommentTrigger = {
  type: "comment";
  match: "keyword" | "any";
  keywords: string[];
  mediaIds: string[];
};

export type MessageTrigger = {
  type: "message";
  match: "keyword" | "any";
  keywords: string[];
};

export type FlowCondition =
  | { type: "contains_keyword"; keywords: string[] }
  | { type: "media_is"; mediaIds: string[] };

export type FlowAction =
  | { type: "private_reply"; text: string }
  | { type: "send_text"; text: string }
  | { type: "send_link"; text: string; url: string }
  | { type: "send_button"; text: string; buttonLabel: string; url: string };

export type FlowDefinition = {
  version: 1;
  trigger: CommentTrigger | MessageTrigger;
  conditions: FlowCondition[];
  actions: FlowAction[];
};

export type NormalizedEvent = {
  id: string;
  accountId: string;
  type: "comment.created" | "message.received" | "postback.received";
  text: string;
  commentId?: string;
  mediaId?: string;
  recipientId?: string;
  timestamp: number;
};

export type ExecutionAction =
  | { type: "private_reply"; commentId: string; text: string }
  | { type: "send_text"; recipientId: string; text: string }
  | { type: "send_link"; recipientId: string; text: string; url: string }
  | {
      type: "send_button";
      recipientId: string;
      text: string;
      buttonLabel: string;
      url: string;
    };

export type EvaluationResult =
  | { status: "matched"; actions: ExecutionAction[] }
  | { status: "skipped"; reason: string; actions: [] };
