import type { FlowDefinitionV1 } from "../types";

export type ChannelProvider = "INSTAGRAM" | "FACEBOOK";
export type ChannelSurface = "COMMENT" | "MESSAGING";
export type ChannelDescriptor = { provider: ChannelProvider; surface: ChannelSurface };
export type ChannelTarget = ChannelDescriptor & { connectionId: string };
export type AutomationTriggerType = FlowDefinitionV1["trigger"]["type"];
export type AutomationActionType = FlowDefinitionV1["actions"][number]["type"];

export type ChannelCapability = {
  id: "instagram-comment" | "instagram-messaging" | "facebook-page-comment";
  target: ChannelDescriptor;
  triggers: readonly AutomationTriggerType[];
  actions: readonly AutomationActionType[];
  actionSemantics: Partial<Record<AutomationActionType, "private_reply" | "public_page_reply" | "message">>;
  requiredPermissions: readonly string[];
  connectionKind: "instagram-account" | "facebook-page";
  label: string;
};

export type ChannelValidationIssue = {
  path: (string | number)[];
  message: string;
};
