import type { ChannelCapability } from "./types";

export const instagramCapabilities: readonly ChannelCapability[] = [
  {
    id: "instagram-comment",
    target: { provider: "INSTAGRAM", surface: "COMMENT" },
    triggers: ["comment"],
    actions: ["private_reply"],
    actionSemantics: { private_reply: "private_reply" },
    requiredPermissions: ["instagram_business_basic", "instagram_business_manage_comments"],
    connectionKind: "instagram-account",
    label: "Instagram comments",
  },
  {
    id: "instagram-messaging",
    target: { provider: "INSTAGRAM", surface: "MESSAGING" },
    triggers: ["message", "referral", "optin", "first_contact", "story_mention"],
    actions: ["send_text", "send_link", "send_button", "send_image", "quick_replies"],
    actionSemantics: {
      send_text: "message",
      send_link: "message",
      send_button: "message",
      send_image: "message",
      quick_replies: "message",
    },
    requiredPermissions: ["instagram_business_basic", "instagram_business_manage_messages"],
    connectionKind: "instagram-account",
    label: "Instagram messages",
  },
] as const;
