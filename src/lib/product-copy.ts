export const PRODUCT_NAVIGATION = {
  home: "Home",
  automations: "Automations",
  quickAutomation: "Quick Automation",
  insights: "Insights",
  contacts: "Contacts",
  inbox: "Inbox",
  settings: "Settings",
  profile: "My Profile",
} as const;

export const PROVIDER_LABELS = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  EMAIL: "Email",
} as const;

export const STATUS_COPY = {
  ACTIVE: "On",
  DRAFT: "Draft",
  PAUSED: "Off",
  CONNECTED: "Connected",
  EXPIRED: "Needs reconnecting",
  DISCONNECTED: "Disconnected",
} as const;

export const COMMON_ACTIONS = {
  saveReply: "Save reply",
  connectInstagram: "Connect Instagram",
  connectFacebook: "Connect Facebook Page",
  applyInvite: "Apply invite",
  enableReplies: "Turn on automatic replies",
} as const;
