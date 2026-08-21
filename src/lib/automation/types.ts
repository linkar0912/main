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

export type FlowDefinitionV1 = {
  version: 1;
  trigger: CommentTrigger | MessageTrigger;
  conditions: FlowCondition[];
  actions: FlowAction[];
};

export type MediaSnapshot = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  timestamp: string;
};

export type FlowDefinitionV2 = {
  version: 2;
  trigger: {
    type: "comment";
    source: "specific_media" | "all_media" | "next_media";
    mediaIds: string[];
    mediaSnapshots: MediaSnapshot[];
    match: "keyword" | "any";
    keywords: string[];
  };
  publicReplies: string[];
  openingMessage: { text: string; optInButtonLabel: string };
  followGate: { required: true; notFollowingMessage: string; recheckButtonLabel: string };
  delivery: { text: string; url: string; buttonLabel?: string };
};

export type FlowDefinition = FlowDefinitionV1 | FlowDefinitionV2;

export type NormalizedEvent = {
  id: string;
  accountId: string;
  type:
    | "comment.created"
    | "message.received"
    | "quick_reply.received"
    | "postback.received"
    | "optin.received"
    | "referral.received";
  text: string;
  commentId?: string;
  mediaId?: string;
  recipientId?: string;
  interactionPayload?: string;
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
