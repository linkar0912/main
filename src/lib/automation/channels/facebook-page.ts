import type { ChannelCapability } from "./types";

export const facebookPageCommentCapability: ChannelCapability = {
  id: "facebook-page-comment",
  target: { provider: "FACEBOOK", surface: "COMMENT" },
  triggers: ["comment"],
  actions: ["private_reply"],
  actionSemantics: { private_reply: "public_page_reply" },
  requiredPermissions: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_read_user_content",
    "pages_manage_engagement",
  ],
  connectionKind: "facebook-page",
  label: "Facebook Page comments",
};
