/**
 * Dev-only fixture data for app/dev-preview/workspace. Every builder runs at
 * request time so relative timestamps ("2 hours ago", "yesterday") stay
 * relative to whenever the preview is opened. Shapes mirror the real
 * app/api/** handlers and the payloads the component tests stub.
 *
 * The workspace is a small Indian fashion label (@studio.kavya) that uses
 * Linkar to answer comment keywords, greet new DMs and run festive drops.
 */
import type { AutomationRecord } from "@/src/lib/repository";
import { BILLING_PLANS } from "@/src/lib/billing/catalog";

export type PreviewScenario = "populated" | "empty" | "error" | "slow";

export type FixtureAnswer =
  | { kind: "json"; status: number; body: unknown }
  /** Never settles (until aborted) - used to hold loading skeletons on screen. */
  | { kind: "hang" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WORKSPACE_ID = "ws_studio_kavya";
const OWNER_EMAIL = "tejastelkar9@gmail.com";
const IG_USER_ID = "17841405822304914";
const IG_USERNAME = "studio.kavya";
const FB_PAGE_ID = "104829377551203";
const FB_PAGE_NAME = "Studio Kavya";

const MEMBERS = [
  { userId: "user_owner_tejas", email: OWNER_EMAIL, role: "OWNER" },
  { userId: "user_riya_ops", email: "riya.ops@studiokavya.in", role: "ADMIN" },
  { userId: "user_kunal_dm", email: "kunal@studiokavya.in", role: "MEMBER" },
];

function ago(ms: number, now = Date.now()): string {
  return new Date(now - ms).toISOString();
}

function ahead(ms: number, now = Date.now()): string {
  return new Date(now + ms).toISOString();
}

function json(body: unknown, status = 200): FixtureAnswer {
  return { kind: "json", status, body };
}

/** Local SVG avatars (data: URIs are allowed by the CSP; no network). */
function avatar(initials: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="58" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 9:16 abstract Reel cover. */
function reelCover(from: string, to: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="360" height="640" fill="url(#g)"/><circle cx="280" cy="140" r="120" fill="${accent}" opacity="0.35"/><circle cx="70" cy="470" r="150" fill="#ffffff" opacity="0.12"/><rect x="40" y="520" width="200" height="14" rx="7" fill="#ffffff" opacity="0.7"/><rect x="40" y="546" width="140" height="10" rx="5" fill="#ffffff" opacity="0.45"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Oldest-first UTC day keys, matching countParticipantsPerDay's output. */
function series(counts: number[], now = Date.now()): Array<{ day: string; count: number }> {
  return counts.map((count, index) => ({
    day: new Date(now - (counts.length - 1 - index) * DAY).toISOString().slice(0, 10),
    count,
  }));
}

const SENT_14 = [38, 44, 31, 52, 47, 61, 57, 72, 66, 85, 93, 78, 104, 121];
const REACHED_14 = [29, 35, 26, 41, 39, 48, 44, 58, 51, 67, 74, 63, 82, 96];

// ---------------------------------------------------------------- workspace

function bootstrap(scenario: PreviewScenario) {
  const empty = scenario === "empty";
  return {
    data: {
      email: OWNER_EMAIL,
      role: "OWNER",
      plan: empty ? "free" : "growth",
      planName: empty ? "Free" : "Growth",
      igAvatarUrl: null,
      platformOwner: true,
      supportEmail: "support@linkar.in",
      mode: "configured",
    },
  };
}

function account(scenario: PreviewScenario) {
  const empty = scenario === "empty";
  return {
    data: {
      id: MEMBERS[0].userId,
      email: OWNER_EMAIL,
      workspaceId: WORKSPACE_ID,
      role: "OWNER",
      plan: empty ? "free" : "growth",
      planName: empty ? "Free" : "Growth",
      memberSince: empty ? ago(12 * MINUTE) : ago(142 * DAY),
      emailVerified: !empty,
    },
  };
}

function instagramConnections(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [{
      id: "conn_ig_kavya",
      igUserId: IG_USER_ID,
      username: IG_USERNAME,
      status: "CONNECTED",
      connectedAt: ago(138 * DAY),
      profilePictureUrl: avatar("SK", "#c2410c", "#be185d"),
    }],
  };
}

function facebookPages(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [{
      id: "conn_fb_kavya",
      pageId: FB_PAGE_ID,
      pageName: FB_PAGE_NAME,
      status: "CONNECTED",
      connectedAt: ago(96 * DAY),
      avatarUrl: avatar("SK", "#1d4ed8", "#7c3aed"),
    }],
  };
}

function instagramHealth(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [{
      id: "conn_ig_kavya",
      username: IG_USERNAME,
      status: "CONNECTED",
      requiredFields: ["comments", "messages"],
      subscribedFields: ["comments", "messages", "messaging_postbacks", "messaging_optins"],
      missingFields: [],
    }],
  };
}

function facebookHealth(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [{
      id: "conn_fb_kavya",
      pageId: FB_PAGE_ID,
      pageName: FB_PAGE_NAME,
      status: "CONNECTED",
      requiredFields: ["feed"],
      subscribedFields: ["feed"],
      missingFields: [],
    }],
  };
}

function teamOverview(scenario: PreviewScenario) {
  if (scenario === "empty") {
    return { members: [{ email: OWNER_EMAIL, role: "OWNER" }], invitations: [] };
  }
  return {
    members: MEMBERS.map(({ email, role }) => ({ email, role })),
    invitations: [{ id: "inv_arjun", email: "arjun.m@studiokavya.in", role: "MEMBER", expiresAt: ahead(5 * DAY) }],
  };
}

function teamMembers(scenario: PreviewScenario) {
  return { data: scenario === "empty" ? [MEMBERS[0]] : MEMBERS };
}

function messagingSettings(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: null };
  return { data: { startHour: 23, endHour: 8, timezone: "Asia/Kolkata" } };
}

function billing(scenario: PreviewScenario) {
  const empty = scenario === "empty";
  return {
    data: {
      catalog: Object.values(BILLING_PLANS),
      canManage: true,
      billingConfigured: true,
      entitlementPlanKey: empty ? "free" : "growth",
      deliveriesUsed: empty ? 0 : 6_482,
      subscription: empty ? null : {
        status: "ACTIVE",
        planId: "plan_growth",
        interval: "MONTHLY",
        currentPeriodEnd: ahead(19 * DAY),
        cancelAtPeriodEnd: false,
        pendingPlanId: null,
      },
    },
  };
}

// -------------------------------------------------------------- automations

function automationBase(now: number) {
  return {
    workspaceId: WORKSPACE_ID,
    provider: "INSTAGRAM" as const,
    priority: 0,
    createdAt: ago(60 * DAY, now),
    updatedAt: ago(2 * DAY, now),
  };
}

export function automations(): AutomationRecord[] {
  const now = Date.now();
  const base = automationBase(now);
  return [
    {
      ...base,
      id: "auto_price_list",
      name: "Send price list on 'PRICE' comment",
      status: "ACTIVE",
      version: 7,
      activatedAt: ago(41 * DAY, now),
      updatedAt: ago(3 * HOUR, now),
      priority: 10,
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["PRICE", "price list", "rate", "kitna"], mediaIds: [], mode: "any", replyOncePerUser: true },
        conditions: [],
        actions: [
          { type: "private_reply", text: "Hi {username}! Sending our latest price list to your DMs now 💌" },
          { type: "send_link", text: "Here's the full price list for the festive collection. Sizes XS–3XL, COD available across India.", url: "https://studiokavya.in/price-list" },
        ],
        dailySendLimit: 500,
      },
    },
    {
      ...base,
      id: "auto_story_thanks",
      name: "Story mention thank-you",
      status: "ACTIVE",
      version: 3,
      activatedAt: ago(55 * DAY, now),
      updatedAt: ago(9 * DAY, now),
      definition: {
        version: 1,
        trigger: { type: "story_mention" },
        conditions: [],
        actions: [{ type: "send_text", text: "Thank you so much for tagging us, {username}! 🧡 Use code KAVYA10 for 10% off your next order." }],
      },
    },
    {
      ...base,
      id: "auto_welcome_dm",
      name: "Welcome new DMs",
      status: "ACTIVE",
      version: 4,
      activatedAt: ago(58 * DAY, now),
      updatedAt: ago(1 * DAY, now),
      definition: {
        version: 1,
        trigger: { type: "first_contact" },
        conditions: [],
        actions: [{ type: "quick_replies", text: "Namaste! 🙏 Welcome to Studio Kavya. What can we help you with today?", replies: ["Price list", "Track my order", "Bridal consult", "Talk to a human"] }],
      },
    },
    {
      ...base,
      id: "auto_diwali_sale",
      name: "Diwali sale link",
      status: "ACTIVE",
      version: 2,
      activatedAt: ago(4 * DAY, now),
      updatedAt: ago(5 * HOUR, now),
      priority: 20,
      definition: {
        version: 2,
        trigger: {
          type: "comment",
          source: "specific_media",
          mediaIds: ["17998832451207733"],
          mediaSnapshots: [{
            id: "17998832451207733",
            caption: "Diwali edit drop 1 ✨ Comment DIWALI for early access",
            mediaType: "VIDEO",
            mediaProductType: "REELS",
            permalink: "https://www.instagram.com/reel/DxKav01/",
            timestamp: ago(4 * DAY, now),
          }],
          match: "keyword",
          keywords: ["DIWALI", "SALE", "LINK"],
        },
        publicReplies: ["Check your DMs ✨", "Sent! Happy Diwali 🪔", "Link is in your inbox 💛"],
        openingMessage: { text: "Hey {username}! Tap below and we'll send the Diwali early-access link 🪔", optInButtonLabel: "Send me the link" },
        followGate: { required: true, notFollowingMessage: "Early access is for our followers - follow @studio.kavya and tap again!", recheckButtonLabel: "I followed" },
        delivery: { text: "Here's your early-access link. Sale prices are live for 48 hours!", url: "https://studiokavya.in/collections/diwali-edit", buttonLabel: "Shop the edit" },
        dailySendLimit: 1_000,
      },
    },
    {
      ...base,
      id: "auto_kurta_waitlist",
      name: "Kurta restock waitlist",
      status: "PAUSED",
      version: 5,
      activatedAt: ago(30 * DAY, now),
      updatedAt: ago(6 * DAY, now),
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["RESTOCK", "WAITLIST", "back in stock"], mode: "any" },
        conditions: [],
        actions: [{ type: "send_text", text: "The block-print kurtas sell out fast! Want a heads-up when they're back?" }],
        emailCapture: {
          promptText: "Drop your email and we'll tell you the moment they restock.",
          retryText: "Hmm, that doesn't look like an email - could you try again?",
          confirmationText: "You're on the list! 🎉",
        },
      },
    },
    {
      ...base,
      id: "auto_bridal_consult",
      name: "Bridal consult booking",
      status: "DRAFT",
      version: 1,
      updatedAt: ago(26 * HOUR, now),
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["BRIDAL", "lehenga", "wedding"], mode: "any" },
        conditions: [],
        actions: [{ type: "send_button", text: "Congratulations! 💍 Book a free 20-minute video consult with our bridal stylist.", buttonLabel: "Book a slot", url: "https://studiokavya.in/bridal-consult" }],
      },
    },
    {
      ...base,
      id: "auto_fb_details",
      name: "Reply to 'details' on Facebook posts",
      provider: "FACEBOOK",
      facebookPageId: FB_PAGE_ID,
      status: "ACTIVE",
      version: 2,
      activatedAt: ago(20 * DAY, now),
      updatedAt: ago(20 * DAY, now),
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["details", "price", "available"], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "Thanks for asking! Full details and sizes are on studiokavya.in - or DM us on Instagram @studio.kavya 🧡" }],
      },
    },
  ];
}

function deliveries() {
  const now = Date.now();
  return {
    data: [
      { kind: "CLASSIC_ACTION", state: "FAILED", attemptCount: 2, automationId: "auto_price_list", lastError: "(#4) Application request limit reached", updatedAt: ago(25 * MINUTE, now) },
      { kind: "BROADCAST_RECIPIENT", state: "UNKNOWN", attemptCount: 1, broadcastId: "bc_dhanteras", lastError: "Meta did not confirm delivery before the request timed out", updatedAt: ago(3 * HOUR, now) },
      { kind: "SEQUENCE_STEP", state: "FAILED", attemptCount: 1, sequenceEnrollmentId: "enr_7781", lastError: "(#10) This message is sent outside of allowed window.", updatedAt: ago(20 * HOUR, now) },
      { kind: "EMAIL_CAPTURE", state: "FAILED", attemptCount: 3, automationId: "auto_kurta_waitlist", lastError: "(#551) This person isn't available right now.", updatedAt: ago(2 * DAY, now) },
    ],
  };
}

// ------------------------------------------------------------------ insights

function insightsOverview(scenario: PreviewScenario) {
  const empty = scenario === "empty";
  return {
    timeseries: {
      days: 14,
      participantsPerDay: series(empty ? Array(14).fill(0) : REACHED_14),
      sentPerDay: series(empty ? Array(14).fill(0) : SENT_14),
    },
    capturedEmails: empty ? 0 : 186,
    optedOut: empty ? 0 : 4,
    contactTotalsScope: "workspace",
  };
}

function usage(scenario: PreviewScenario) {
  return {
    deliveriesThisMonth: scenario === "empty" ? 0 : 6_482,
    monthlyDeliveryLimit: scenario === "empty" ? 1_000 : BILLING_PLANS.growth.monthlyDeliveryLimit,
  };
}

function insightsFull(scenario: PreviewScenario) {
  const empty = scenario === "empty";
  return {
    ...insightsOverview(scenario),
    funnel: empty ? {} : { COMMENT_MATCHED: 1_240, OPENING_SENT: 1_182, OPTED_IN: 806, FOLLOW_VERIFIED: 612, LINK_SENT: 588 },
    mediaPerformance: empty ? [] : [
      { mediaId: "17998832451207733", matched: 412, delivered: 371, clicked: 149 },
      { mediaId: "18042217893305561", matched: 288, delivered: 262, clicked: 87 },
      { mediaId: "17885514206612948", matched: 196, delivered: 181, clicked: 52 },
      { mediaId: "18210493377802215", matched: 121, delivered: 109, clicked: 24 },
      { mediaId: "17926680014451379", matched: 64, delivered: 58, clicked: 9 },
    ],
    usage: usage(scenario),
  };
}

function failures(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  const now = Date.now();
  return {
    data: [
      { id: "dlv_9f21", kind: "CLASSIC_ACTION", state: "FAILED", recipientId: "6921583317842201", lastError: "(#10) This message is sent outside of allowed window.", attemptCount: 3, updatedAt: ago(2 * HOUR, now) },
      { id: "dlv_9e87", kind: "CAMPAIGN_ACTION", state: "FAILED", recipientId: "7148822305519927", lastError: "Unsupported post request. Object with ID '17998832451207733' does not exist, cannot be loaded due to missing permissions, or does not support this operation.", attemptCount: 1, updatedAt: ago(7 * HOUR, now) },
      { id: "dlv_9d10", kind: "LEAD_WEBHOOK", state: "FAILED", lastError: "Webhook responded with HTTP 502 Bad Gateway", attemptCount: 5, updatedAt: ago(1 * DAY + 3 * HOUR, now) },
      { id: "dlv_9c42", kind: "SEQUENCE_STEP", state: "FAILED", recipientId: "5530981274460018", lastError: "(#551) This person isn't available right now.", attemptCount: 2, updatedAt: ago(2 * DAY, now) },
      { id: "dlv_9b05", kind: "BROADCAST_RECIPIENT", state: "FAILED", recipientId: "6610247785531190", lastError: "(#4) Application request limit reached", attemptCount: 4, updatedAt: ago(5 * DAY, now) },
    ],
  };
}

function abTests(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [
      { variant: "A", participants: 214, delivered: 188, clicked: 71 },
      { variant: "B", participants: 198, delivered: 183, clicked: 78 },
    ],
  };
}

// --------------------------------------------------------------------- links

function links(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  const now = Date.now();
  return {
    data: [
      { id: "lnk_diwali", slug: "diwali-edit", destination: "https://studiokavya.in/collections/diwali-edit", utmSource: "instagram", utmMedium: "dm", utmCampaign: "diwali_2026", createdAt: ago(4 * DAY, now) },
      { id: "lnk_price", slug: "price-list", destination: "https://studiokavya.in/price-list", utmSource: "instagram", utmMedium: "dm", utmCampaign: "price_keyword", createdAt: ago(41 * DAY, now) },
      { id: "lnk_bridal", slug: "bridal-consult", destination: "https://calendly.com/studiokavya/bridal-consult", utmSource: "instagram", utmMedium: "dm", createdAt: ago(12 * DAY, now), notes: "Draft automation - not live yet" },
      { id: "lnk_kurta", slug: "kurta-restock", destination: "https://studiokavya.in/products/indigo-block-print-kurta", utmSource: "instagram", utmMedium: "dm", utmCampaign: "restock", expiresAt: ahead(10 * DAY, now), createdAt: ago(30 * DAY, now) },
    ],
  };
}

const LINK_STATS: Record<string, { totalClicks: number; uniqueClicks: number; lastAgo: number; countries: Array<[string, number]> }> = {
  "diwali-edit": { totalClicks: 1_284, uniqueClicks: 961, lastAgo: 4 * MINUTE, countries: [["IN", 1_102], ["AE", 88], ["US", 47], ["GB", 31]] },
  "price-list": { totalClicks: 2_419, uniqueClicks: 1_877, lastAgo: 38 * MINUTE, countries: [["IN", 2_241], ["AE", 92], ["SG", 41]] },
  "bridal-consult": { totalClicks: 37, uniqueClicks: 29, lastAgo: 2 * DAY, countries: [["IN", 33], ["CA", 4]] },
  "kurta-restock": { totalClicks: 312, uniqueClicks: 266, lastAgo: 6 * HOUR, countries: [["IN", 297], ["US", 15]] },
};

function linkStats(slug: string) {
  const stats = LINK_STATS[slug] ?? { totalClicks: 0, uniqueClicks: 0, lastAgo: 0, countries: [] };
  return {
    data: {
      totalClicks: stats.totalClicks,
      uniqueClicks: stats.uniqueClicks,
      ...(stats.totalClicks ? { lastClickedAt: ago(stats.lastAgo) } : {}),
      topCountries: stats.countries.map(([country, count]) => ({ country, count })),
    },
  };
}

// ------------------------------------------------------------------ contacts

type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";
type PreviewContact = {
  id: string;
  handle: string;
  initials: string;
  colors: [string, string];
  email?: string;
  state: string;
  tags: string[];
  score: number;
  leadStatus: LeadStatus;
  assigneeUserId?: string;
  suppressed?: boolean;
  lastSeenAgo: number;
  createdAgo: number;
  notes?: string;
  sourceAutomationId?: string;
};

const CONTACTS: PreviewContact[] = [
  { id: "ct_priya", handle: "priya.sharma.styles", initials: "PS", colors: ["#f97316", "#db2777"], email: "priya.sharma@gmail.com", state: "CAPTURED", tags: ["diwali", "repeat-buyer"], score: 42, leadStatus: "CUSTOMER", assigneeUserId: "user_riya_ops", lastSeenAgo: 12 * MINUTE, createdAgo: 64 * DAY, notes: "Ordered 3 kurtas in Sept. Prefers pastel colours, size M.", sourceAutomationId: "auto_price_list" },
  { id: "ct_ananya", handle: "ananya_reddy", initials: "AR", colors: ["#8b5cf6", "#ec4899"], email: "ananya.r@outlook.com", state: "CAPTURED", tags: ["diwali"], score: 27, leadStatus: "QUALIFIED", lastSeenAgo: 2 * HOUR, createdAgo: 4 * DAY, sourceAutomationId: "auto_diwali_sale" },
  { id: "ct_rohan", handle: "rohan.k.verma", initials: "RV", colors: ["#0ea5e9", "#6366f1"], state: "AWAITING_EMAIL", tags: ["restock"], score: 9, leadStatus: "ENGAGED", lastSeenAgo: 3 * HOUR, createdAgo: 8 * DAY, sourceAutomationId: "auto_kurta_waitlist" },
  { id: "ct_meera", handle: "meera_iyer", initials: "MI", colors: ["#14b8a6", "#0ea5e9"], email: "meera.iyer92@gmail.com", state: "CAPTURED", tags: ["bridal", "vip"], score: 55, leadStatus: "QUALIFIED", assigneeUserId: "user_owner_tejas", lastSeenAgo: 5 * HOUR, createdAgo: 21 * DAY, notes: "Wedding in Feb (Chennai). Wants a consult for a pastel lehenga + 2 bridesmaid sets." },
  { id: "ct_aditi", handle: "aditi.joshi_", initials: "AJ", colors: ["#f43f5e", "#f59e0b"], state: "NONE", tags: ["price-list"], score: 6, leadStatus: "NEW", lastSeenAgo: 9 * HOUR, createdAgo: 9 * HOUR, sourceAutomationId: "auto_price_list" },
  { id: "ct_kabir", handle: "kabir.malhotra", initials: "KM", colors: ["#22c55e", "#0d9488"], state: "NONE", tags: [], score: 3, leadStatus: "NEW", lastSeenAgo: 22 * HOUR, createdAgo: 22 * HOUR },
  { id: "ct_neha", handle: "neha.kapoor.designs", initials: "NK", colors: ["#a855f7", "#6366f1"], email: "neha@nehakapoordesigns.com", state: "CAPTURED", tags: ["collab", "diwali"], score: 31, leadStatus: "ENGAGED", assigneeUserId: "user_kunal_dm", lastSeenAgo: 1 * DAY + 4 * HOUR, createdAgo: 35 * DAY, notes: "Creator collab enquiry - 48k followers, home decor + festive styling." },
  { id: "ct_arjun", handle: "arjun_nair", initials: "AN", colors: ["#eab308", "#ea580c"], state: "NONE", tags: ["price-list"], score: 4, leadStatus: "NEW", lastSeenAgo: 1 * DAY + 9 * HOUR, createdAgo: 2 * DAY, sourceAutomationId: "auto_price_list" },
  { id: "ct_ishita", handle: "ishita.banerjee", initials: "IB", colors: ["#ec4899", "#8b5cf6"], email: "ishita.b@yahoo.co.in", state: "CAPTURED", tags: ["diwali", "repeat-buyer"], score: 48, leadStatus: "CUSTOMER", lastSeenAgo: 2 * DAY, createdAgo: 88 * DAY },
  { id: "ct_siddharth", handle: "siddharth.rao", initials: "SR", colors: ["#3b82f6", "#06b6d4"], state: "NONE", tags: [], score: 2, leadStatus: "NEW", lastSeenAgo: 3 * DAY, createdAgo: 3 * DAY },
  { id: "ct_pooja", handle: "pooja.patel_23", initials: "PP", colors: ["#f97316", "#facc15"], email: "pooja.patel23@gmail.com", state: "CAPTURED", tags: ["restock"], score: 18, leadStatus: "ENGAGED", lastSeenAgo: 4 * DAY, createdAgo: 30 * DAY, sourceAutomationId: "auto_kurta_waitlist" },
  { id: "ct_vikram", handle: "vikram.singh.photo", initials: "VS", colors: ["#64748b", "#0f172a"], state: "NONE", tags: ["collab"], score: 12, leadStatus: "ENGAGED", lastSeenAgo: 5 * DAY, createdAgo: 18 * DAY },
  { id: "ct_sneha", handle: "sneha.desai", initials: "SD", colors: ["#10b981", "#84cc16"], email: "sneha.desai@gmail.com", state: "CAPTURED", tags: ["opted_out"], score: 5, leadStatus: "NEW", suppressed: true, lastSeenAgo: 9 * DAY, createdAgo: 40 * DAY },
  { id: "ct_tanvi", handle: "tanvi.mehta", initials: "TM", colors: ["#d946ef", "#f43f5e"], email: "tanvi.mehta@icloud.com", state: "CAPTURED", tags: ["bridal"], score: 36, leadStatus: "CUSTOMER", assigneeUserId: "user_riya_ops", lastSeenAgo: 12 * DAY, createdAgo: 70 * DAY },
];

function contactRow(contact: PreviewContact, now: number) {
  return {
    id: contact.id,
    instagramAccountId: IG_USER_ID,
    igScopedUserId: `69${contact.id.length}${contact.handle.length}0${contact.score}4417${contact.initials.charCodeAt(0)}`,
    instagramUsername: contact.handle,
    avatarUrl: avatar(contact.initials, contact.colors[0], contact.colors[1]),
    ...(contact.email ? { email: contact.email } : {}),
    state: contact.state,
    tags: contact.tags,
    score: contact.score,
    leadStatus: contact.leadStatus,
    ...(contact.assigneeUserId ? { assigneeUserId: contact.assigneeUserId } : {}),
    ...(contact.suppressed ? { suppressedAt: ago(contact.lastSeenAgo, now) } : {}),
    lastSeenAt: ago(contact.lastSeenAgo, now),
    createdAt: ago(contact.createdAgo, now),
  };
}

function contactsList(scenario: PreviewScenario, url: URL) {
  if (scenario === "empty") {
    return { data: { count: 0, counts: { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 }, contacts: [], hasMore: false } };
  }
  const now = Date.now();
  const stage = url.searchParams.get("leadStatus");
  const counts = { NEW: 0, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 };
  for (const contact of CONTACTS) counts[contact.leadStatus] += 1;
  const rows = CONTACTS.filter((contact) => !stage || contact.leadStatus === stage).map((contact) => contactRow(contact, now));
  return { data: { count: rows.length, counts, contacts: rows, hasMore: false } };
}

/**
 * <img> sources that point at API routes (the contact drawer renders
 * /api/contacts/<id>/avatar). fetch never sees those, so the shim rewrites
 * them to these data: URIs instead of letting them hit the real server.
 */
export function imageFor(url: URL): string | null {
  const match = /^\/api\/contacts\/([^/]+)\/avatar$/.exec(url.pathname);
  if (!match) return null;
  const contact = CONTACTS.find((candidate) => candidate.id === decodeURIComponent(match[1]));
  return contact ? avatar(contact.initials, contact.colors[0], contact.colors[1]) : avatar("IG", "#64748b", "#334155");
}

function contactDetail(id: string) {
  const contact = CONTACTS.find((candidate) => candidate.id === id);
  if (!contact) return null;
  const now = Date.now();
  const row = contactRow(contact, now);
  const timeline: Array<{ id: string; kind: string; at: string; label: string; detail?: string }> = [];
  timeline.push({ id: `participant:${id}:1`, kind: "interaction", at: ago(contact.lastSeenAgo, now), label: "Campaign delivery sent", detail: `keyword "${contact.tags.includes("diwali") ? "DIWALI" : "PRICE"}"` });
  if (contact.email) timeline.push({ id: "milestone:email", kind: "email_captured", at: ago(contact.lastSeenAgo + 6 * MINUTE, now), label: "Email captured", detail: contact.email });
  if (contact.tags.includes("restock")) timeline.push({ id: `enrollment:${id}`, kind: "sequence", at: ago(contact.lastSeenAgo + 20 * MINUTE, now), label: "Sequence enrollment", detail: "Kurta restock nurture" });
  timeline.push({ id: `participant:${id}:0`, kind: "interaction", at: ago(contact.createdAgo, now), label: "Campaign interaction", detail: "OPENING_SENT" });
  if (contact.suppressed) timeline.unshift({ id: "milestone:optout", kind: "opted_out", at: row.lastSeenAt, label: "Opted out" });
  return {
    data: {
      contact: {
        ...row,
        ...(contact.notes ? { notes: contact.notes } : {}),
        ...(contact.sourceAutomationId ? { sourceAutomationId: contact.sourceAutomationId } : {}),
        automationsPaused: id === "ct_meera",
      },
      timeline,
    },
  };
}

// --------------------------------------------------------------------- inbox

type ThreadLine = [direction: "inbound" | "outbound", text: string, minutesAgo: number];

const THREADS: Record<string, ThreadLine[]> = {
  ct_priya: [
    ["inbound", "Hiii! Loved the new mul cotton kurtas 😍", 70],
    ["outbound", "Hi Priya! Thank you 🧡 Which colour caught your eye?", 68],
    ["inbound", "The sage green one. Is M available?", 30],
    ["outbound", "Yes! M and L are in stock. Want me to hold one for you till tonight?", 28],
    ["inbound", "Yes please! Also can you share the price list?", 12],
  ],
  ct_ananya: [
    ["inbound", "DIWALI", 125],
    ["outbound", "Hey ananya_reddy! Tap below and we'll send the Diwali early-access link 🪔", 125],
    ["outbound", "Here's your early-access link. Sale prices are live for 48 hours!", 123],
    ["inbound", "Does the sale include the Banarasi dupattas?", 120],
  ],
  ct_rohan: [
    ["inbound", "Is the indigo block print kurta coming back? RESTOCK", 190],
    ["outbound", "The block-print kurtas sell out fast! Want a heads-up when they're back?", 190],
    ["outbound", "Drop your email and we'll tell you the moment they restock.", 190],
  ],
  ct_meera: [
    ["inbound", "Hi, I'm getting married in Feb and loved your pastel lehengas", 26 * 60],
    ["outbound", "Congratulations Meera! 💍 Would you like a video consult with our bridal stylist?", 25 * 60],
    ["inbound", "Yes! Saturday afternoon works best", 24 * 60],
    ["outbound", "Booked you for Saturday 3 pm IST. Sending the link on WhatsApp too 😊", 310],
    ["inbound", "Perfect, thank you so much!", 300],
  ],
  ct_aditi: [
    ["inbound", "PRICE", 540],
    ["outbound", "Here's the full price list for the festive collection. Sizes XS–3XL, COD available across India.", 540],
  ],
  ct_kabir: [
    ["inbound", "Do you ship to Pune? How many days?", 22 * 60],
  ],
  ct_neha: [
    ["inbound", "Hi team! I'm a home + festive styling creator (48k). Would love to collab for Diwali", 2 * 24 * 60],
    ["outbound", "Hi Neha, we'd love that! Sharing this with our collabs lead Kunal.", 2 * 24 * 60 - 40],
    ["inbound", "Sounds great - here's my media kit", 28 * 60],
  ],
  ct_arjun: [
    ["inbound", "price?", 33 * 60],
    ["outbound", "Here's the full price list for the festive collection. Sizes XS–3XL, COD available across India.", 33 * 60],
  ],
  ct_ishita: [
    ["inbound", "Got my order today, the fabric is so soft ✨", 2 * 24 * 60],
    ["outbound", "Yay! So happy you love it, Ishita 🧡 Tag us when you wear it!", 2 * 24 * 60 - 15],
  ],
};

function inboxContacts(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: { contacts: [], members: [MEMBERS[0]] } };
  const now = Date.now();
  const contacts = Object.entries(THREADS).map(([id, lines]) => {
    const contact = CONTACTS.find((candidate) => candidate.id === id)!;
    const last = lines[lines.length - 1];
    const lastInbound = [...lines].reverse().find((line) => line[0] === "inbound");
    const minutesSinceInbound = lastInbound ? lastInbound[2] : Infinity;
    return {
      id,
      username: contact.handle,
      avatarUrl: avatar(contact.initials, contact.colors[0], contact.colors[1]),
      preview: last[1],
      lastMessageAt: ago(last[2] * MINUTE, now),
      canMessage: minutesSinceInbound < 24 * 60,
      unread: last[0] === "inbound" && last[2] < 6 * 60,
      leadStatus: contact.leadStatus,
      tags: contact.tags,
      inboxStatus: id === "ct_ishita" ? "CLOSED" : "OPEN",
      favorite: id === "ct_meera" || id === "ct_neha",
      ...(id === "ct_neha" ? { reminderAt: ahead(20 * HOUR, now) } : {}),
      ...(id === "ct_kabir" ? { reminderAt: ago(1 * HOUR, now) } : {}),
      ...(contact.assigneeUserId ? { assigneeUserId: contact.assigneeUserId } : {}),
      ...(id === "ct_meera" ? { automationsPausedUntil: ahead(9 * HOUR, now) } : {}),
    };
  }).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return { data: { contacts, members: MEMBERS } };
}

function inboxThread(id: string) {
  const lines = THREADS[id] ?? [];
  const now = Date.now();
  return {
    data: {
      messages: lines.map(([direction, text, minutesAgo], index) => ({
        id: `msg_${id}_${index}`,
        direction,
        text,
        at: ago(minutesAgo * MINUTE, now),
        status: direction === "inbound" ? "received" : "sent",
      })),
    },
  };
}

function facebookActivity(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: { items: [] } };
  const now = Date.now();
  const comments: Array<[string, string, number]> = [
    ["Lakshmi Narayanan", "Is the maroon Kanjeevaram available in a blouse size 40?", 35],
    ["Rahul Gupta", "Price details please", 3 * 60],
    ["Farah Siddiqui", "Delivery to Hyderabad before Diwali?", 9 * 60],
    ["Deepa Krishnan", "Beautiful collection 😍", 27 * 60],
    ["Harpreet Kaur", "Available in kids sizes?", 2 * 24 * 60],
  ];
  return {
    data: {
      items: comments.map(([from, summary, minutesAgo], index) => ({
        id: `fb_evt_${index}`,
        channel: "facebook",
        type: "facebook.comment.created",
        label: "Facebook Page comment",
        at: ago(minutesAgo * MINUTE, now),
        account: FB_PAGE_ID,
        from,
        summary,
        avatarUrl: avatar(from.split(" ").map((part) => part[0]).join(""), "#1d4ed8", "#0ea5e9"),
      })),
    },
  };
}

// --------------------------------------------------------------------- media

function media(scenario: PreviewScenario) {
  if (scenario === "empty") return null;
  const now = Date.now();
  const items: Array<[string, string, "REELS" | "FEED", number, [string, string, string]]> = [
    ["18101928374650011", "Diwali edit drop 1 ✨ Comment DIWALI for early access", "REELS", 4 * DAY, ["#7c2d12", "#f59e0b", "#fde68a"]],
    ["18042217893305561", "How we hand-block print our cotton kurtas in Jaipur 🪵", "REELS", 9 * DAY, ["#1e3a8a", "#38bdf8", "#e0f2fe"]],
    ["17885514206612948", "Bridal lehenga fitting - behind the scenes 💍", "REELS", 14 * DAY, ["#831843", "#f472b6", "#fce7f3"]],
    ["18210493377802215", "5 ways to style one dupatta this festive season", "REELS", 19 * DAY, ["#14532d", "#4ade80", "#dcfce7"]],
    ["17926680014451379", "Festive jewellery haul under ₹999 - comment PRICE", "REELS", 26 * DAY, ["#581c87", "#c084fc", "#f3e8ff"]],
    ["18003377221190456", "Studio tour: our new Jaipur workshop", "REELS", 33 * DAY, ["#78350f", "#fb923c", "#ffedd5"]],
    ["17955128830012345", "New arrivals: sage green mul cotton set", "FEED", 6 * DAY, ["#365314", "#a3e635", "#ecfccb"]],
    ["17844501239987766", "Customer love 🧡 @ishita.banerjee in our ivory chikankari", "FEED", 16 * DAY, ["#44403c", "#d6d3d1", "#fafaf9"]],
  ];
  return {
    data: items.map(([id, caption, productType, age, colors]) => ({
      id,
      caption,
      mediaType: productType === "REELS" ? "VIDEO" : "IMAGE",
      mediaProductType: productType,
      permalink: `https://www.instagram.com/${productType === "REELS" ? "reel" : "p"}/${id.slice(-8)}/`,
      thumbnailUrl: reelCover(colors[0], colors[1], colors[2]),
      timestamp: ago(age, now),
    })),
    paging: {},
  };
}

// --------------------------------------------------------- sequences/broadcasts

function sequences(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [
      {
        id: "seq_restock",
        name: "Kurta restock nurture",
        status: "ACTIVE",
        sourceAutomationId: "auto_kurta_waitlist",
        enrolledCount: 142,
        steps: [
          { id: "st_1", delayHours: 0, text: "Thanks for joining the waitlist! Here's a sneak peek of the new indigo prints 👀" },
          { id: "st_2", delayHours: 6, text: "Quick heads-up: waitlist members get first dibs + free shipping on the restock." },
          { id: "st_3", delayHours: 20, text: "They're back! Tap to shop before they sell out again 🛍️" },
        ],
      },
      {
        id: "seq_price",
        name: "Price list follow-up",
        status: "PAUSED",
        sourceAutomationId: "auto_price_list",
        enrolledCount: 58,
        steps: [
          { id: "st_4", delayHours: 2, text: "Did you find something you liked in the price list? Happy to help with sizing 😊" },
          { id: "st_5", delayHours: 18, text: "Use code KAVYA10 for 10% off - valid for the next 24 hours." },
        ],
      },
      {
        id: "seq_bridal",
        name: "Bridal consult reminders",
        status: "DRAFT",
        enrolledCount: 0,
        steps: [{ id: "st_6", delayHours: 1, text: "Your bridal consult is coming up! Keep a few reference photos handy 💍" }],
      },
    ],
  };
}

function broadcasts(scenario: PreviewScenario) {
  if (scenario === "empty") return { data: [] };
  return {
    data: [
      { id: "bc_dhanteras", name: "Dhanteras jewellery drop", status: "RUNNING", segment: "all_contacts", total: 412, sent: 268, failed: 2, skipped: 9 },
      { id: "bc_diwali_early", name: "Diwali early access - waitlist", status: "COMPLETED", segment: "captured_email", total: 186, sent: 179, failed: 3, skipped: 4 },
      { id: "bc_navratri", name: "Navratri restock alert", status: "COMPLETED", segment: "all_contacts", total: 344, sent: 331, failed: 5, skipped: 8 },
      { id: "bc_monsoon", name: "Monsoon sale last call", status: "CANCELLED", segment: "captured_email", total: 120, sent: 41, failed: 0, skipped: 0 },
    ],
  };
}

// ------------------------------------------------- per-automation activity

const DIWALI_REEL = {
  id: "17998832451207733",
  caption: "Diwali edit drop 1 ✨ Comment DIWALI for early access",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/DxKav01/",
};
const DUPATTA_REEL = {
  id: "18210493377802215",
  caption: "5 ways to style one dupatta this festive season - comment LINK and we'll DM you the full lookbook with every product tagged so you can shop each look in one tap 🧣",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/DxKav02/",
};

type ParticipantFixture = [handle: string | undefined, keyword: string, state: string, minutesAgo: number, reel: typeof DIWALI_REEL, extra?: Record<string, unknown>];

const PARTICIPANTS: ParticipantFixture[] = [
  ["ananya_reddy", "DIWALI", "LINK_SENT", 12, DIWALI_REEL, { followStatus: true, finalDeliveryStatus: "SENT", deliveryClickedAt: true, variantLabel: "B" }],
  ["priya.sharma.styles", "diwali", "FOLLOW_REQUIRED", 26, DIWALI_REEL, { followStatus: false, variantLabel: "A" }],
  ["rohan.k.verma", "SALE", "FAILED", 48, DIWALI_REEL, { finalDeliveryStatus: "FAILED", finalDeliveryError: "(#10) This message is sent outside of allowed window." }],
  [undefined, "LINK", "OPENING_SENT", 95, DIWALI_REEL],
  ["meera_iyer", "DIWALI", "LINK_SENT", 3 * 60, DIWALI_REEL, { followStatus: true, finalDeliveryStatus: "SENT", variantLabel: "A" }],
  ["kabir.malhotra", "diwali!!", "EXPIRED", 26 * 60, DIWALI_REEL],
  ["supercalifragilisticexpialidocious_shopper_2026", "LINK", "OPTED_IN", 30 * 60, DUPATTA_REEL],
  ["neha.kapoor.designs", "link", "LINK_SENT", 2 * 24 * 60, DUPATTA_REEL, { followStatus: true, finalDeliveryStatus: "SENT", deliveryClickedAt: true }],
];

function activity(id: string, scenario: PreviewScenario) {
  if (id === "auto_fb_details") {
    const now = Date.now();
    const rows = scenario === "empty" ? [] : [
      { result: "SENT", authorName: "Lakshmi Narayanan", commentPreview: "Is the maroon Kanjeevaram available in a blouse size 40?", replyPreview: "Thanks for asking! Full details and sizes are on studiokavya.in", minutes: 35 },
      { result: "SKIPPED", authorName: "Rahul Gupta", commentPreview: "Price details please", safeErrorCode: "replyOncePerUser is set and this sender already received a reply", minutes: 3 * 60 },
      { result: "FAILED", authorName: "Farah Siddiqui", commentPreview: "Delivery to Hyderabad before Diwali?", safeErrorCode: "facebook_api_error", minutes: 9 * 60 },
    ];
    return {
      channel: { provider: "FACEBOOK", surface: "COMMENT", connectionName: FB_PAGE_NAME },
      data: rows.map(({ minutes, ...row }, index) => ({
        id: `fbx_${index}`, provider: "FACEBOOK", surface: "COMMENT", connectionName: FB_PAGE_NAME, eventType: "comment.created",
        ...row, createdAt: ago(minutes * MINUTE, now),
      })),
    };
  }
  if (scenario === "empty") return { data: [], summary: { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 } };
  const now = Date.now();
  const data = PARTICIPANTS.map(([handle, keyword, state, minutesAgo, reel, extra = {}], index) => {
    const opened = state !== "COMMENT_MATCHED";
    return {
      id: `par_${index}`,
      ...(handle ? { instagramUsername: handle } : {}),
      sourceMediaSnapshot: { ...reel, timestamp: ago(4 * DAY, now) },
      matchedKeyword: keyword,
      state,
      publicReplyStatus: "SENT",
      openingStatus: opened ? "SENT" : "PENDING",
      finalDeliveryStatus: "PENDING",
      ...(extra.followStatus !== undefined ? { followCheckedAt: ago((minutesAgo - 2) * MINUTE, now) } : {}),
      ...extra,
      ...(extra.finalDeliveryStatus === "SENT" ? { finalDeliveredAt: ago((minutesAgo - 3) * MINUTE, now) } : {}),
      ...(extra.deliveryClickedAt ? { deliveryClickedAt: ago((minutesAgo - 5) * MINUTE, now) } : {}),
      createdAt: ago(minutesAgo * MINUTE, now),
    };
  });
  return { data, summary: { commented: 1_240, openingSent: 1_182, optedIn: 806, followed: 612, linkSent: 588 } };
}

// ------------------------------------------------------------------- routing

const INSIGHTS_PATHS = /^\/api\/insights(\/|$)/;
const AUTOMATIONS_PATHS = /^\/api\/automations(\/|$)/;

function readJson(body: unknown): Record<string, unknown> {
  if (typeof body !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * Answers one same-origin /api request. `null` = not mocked (the shim then
 * returns a 404 and warns, so a missing endpoint is easy to spot).
 */
export function answer(method: string, url: URL, scenario: PreviewScenario, rawBody?: unknown): FixtureAnswer | null {
  const path = url.pathname.replace(/\/+$/, "");
  const verb = method.toUpperCase();

  if (scenario === "slow" && INSIGHTS_PATHS.test(path) && verb === "GET") return { kind: "hang" };
  if (scenario === "error" && verb === "GET" && (INSIGHTS_PATHS.test(path) || AUTOMATIONS_PATHS.test(path))) {
    return json({ error: "Service temporarily unavailable" }, 500);
  }

  if (verb === "GET") {
    switch (path) {
      case "/api/site-config": return json({ gaMeasurementId: "" });
      case "/api/workspace/bootstrap": return json(bootstrap(scenario));
      case "/api/account": return json(account(scenario));
      case "/api/meta/connection": return json(instagramConnections(scenario));
      case "/api/facebook/connection": return json(facebookPages(scenario));
      case "/api/meta/connection/health": return json(instagramHealth(scenario));
      case "/api/facebook/connection/health": return json(facebookHealth(scenario));
      case "/api/workspace/messaging": return json(messagingSettings(scenario));
      case "/api/team/invitations": return json(teamOverview(scenario));
      case "/api/team/members": return json(teamMembers(scenario));
      case "/api/billing": return json(billing(scenario));
      case "/api/insights": {
        const include = url.searchParams.get("include");
        if (include === "usage") return json({ usage: usage(scenario) });
        if (include === "overview") return json(insightsOverview(scenario));
        return json(insightsFull(scenario));
      }
      case "/api/insights/failures": return json(failures(scenario));
      case "/api/insights/ab-tests": return json(abTests(scenario));
      case "/api/automations": return json({ data: scenario === "empty" ? [] : automations() });
      case "/api/automations/deliveries": return json(scenario === "empty" ? { data: [] } : deliveries());
      case "/api/automations/suggest-keywords": return json({ data: ["PRICE", "LINK", "DIWALI", "SIZE", "COD"] });
      case "/api/links": return json(links(scenario));
      case "/api/contacts": return json(contactsList(scenario, url));
      case "/api/inbox": return json(inboxContacts(scenario));
      case "/api/activity": return json(facebookActivity(scenario));
      case "/api/sequences": return json(sequences(scenario));
      case "/api/broadcasts": return json(broadcasts(scenario));
      case "/api/meta/media": {
        const page = media(scenario);
        return page ? json(page) : json({ error: "Connect Instagram first" }, 409);
      }
      case "/api/facebook/oauth/pages": return json({ data: [{ id: FB_PAGE_ID, name: FB_PAGE_NAME, category: "Clothing (Brand)" }] });
      default: break;
    }
    const linkStatsMatch = /^\/api\/links\/([^/]+)\/stats$/.exec(path);
    if (linkStatsMatch) return json(linkStats(decodeURIComponent(linkStatsMatch[1])));
    const contactMatch = /^\/api\/contacts\/([^/]+)$/.exec(path);
    if (contactMatch) {
      const detail = contactDetail(decodeURIComponent(contactMatch[1]));
      return detail ? json(detail) : json({ error: "Contact not found" }, 404);
    }
    const threadMatch = /^\/api\/inbox\/([^/]+)$/.exec(path);
    if (threadMatch) return json(inboxThread(decodeURIComponent(threadMatch[1])));
    const automationMatch = /^\/api\/automations\/([^/]+)$/.exec(path);
    if (automationMatch) {
      const found = automations().find((automation) => automation.id === automationMatch[1]);
      return found ? json({ data: found }) : json({ error: "Automation not found" }, 404);
    }
    const activityMatch = /^\/api\/automations\/([^/]+)\/activity$/.exec(path);
    if (activityMatch) return json(activity(decodeURIComponent(activityMatch[1]), scenario));
    const versionsMatch = /^\/api\/automations\/([^/]+)\/versions$/.exec(path);
    if (versionsMatch) {
      const found = automations().find((automation) => automation.id === versionsMatch[1]);
      if (!found) return json({ data: [] });
      return json({
        data: Array.from({ length: Math.min(found.version, 4) }, (_, index) => ({
          id: `ver_${found.id}_${found.version - index}`,
          automationId: found.id,
          workspaceId: WORKSPACE_ID,
          version: found.version - index,
          name: found.name,
          definition: found.definition,
          status: found.status,
          priority: found.priority,
          snapshotAt: ago((index * 3 + 1) * DAY),
          snapshotBy: OWNER_EMAIL,
        })),
      });
    }
    return null;
  }

  // Mutations: plausible success responses so clicking around doesn't error.
  const body = readJson(rawBody);
  const automationMatch = /^\/api\/automations\/([^/]+)$/.exec(path);
  if (automationMatch && verb === "PATCH") {
    const found = automations().find((automation) => automation.id === automationMatch[1]);
    if (!found) return json({ error: "Automation not found" }, 404);
    return json({ data: { ...found, ...(typeof body.status === "string" ? { status: body.status } : {}), version: found.version + 1, updatedAt: new Date().toISOString() } });
  }
  if (automationMatch && verb === "DELETE") return json({ deleted: true });
  if (/^\/api\/automations\/[^/]+\/activity\/retry$/.test(path) && verb === "POST") return json({ data: { queued: true } });
  const duplicateMatch = /^\/api\/automations\/([^/]+)\/duplicate$/.exec(path);
  if (duplicateMatch && verb === "POST") {
    const found = automations().find((automation) => automation.id === duplicateMatch[1]);
    if (!found) return json({ error: "Automation not found" }, 404);
    return json({ data: { ...found, id: `${found.id}_copy`, name: `${found.name} (copy)`, status: "DRAFT", version: 1 } }, 201);
  }
  if (path === "/api/links" && verb === "POST") {
    return json({ data: { id: `lnk_${Date.now()}`, createdAt: new Date().toISOString(), ...body } }, 201);
  }
  if (/^\/api\/links\/[^/]+$/.test(path) && verb === "DELETE") return json({ deleted: true });
  if (path === "/api/contacts" && verb === "POST") return json({ data: { reconciled: 0 } });
  const contactMatch = /^\/api\/contacts\/([^/]+)$/.exec(path);
  if (contactMatch && verb === "PATCH") return json({ data: { ...body } });
  if (/^\/api\/contacts\/[^/]+\/handoff$/.test(path)) return json({ data: { ok: true } });
  const threadMatch = /^\/api\/inbox\/([^/]+)$/.exec(path);
  if (threadMatch && verb === "PATCH") return json({ data: {} });
  if (threadMatch && verb === "POST") {
    const text = typeof body.text === "string" ? body.text : "";
    return json({ data: { message: { id: `msg_sent_${Date.now()}`, direction: "outbound", text, at: new Date().toISOString(), status: "sent" } } });
  }
  if (path === "/api/workspace/messaging" && verb === "PATCH") return json({ data: rawBody === "null" ? null : body });
  if (path === "/api/team/invitations" && verb === "POST") {
    return json({ invitation: { id: `inv_${Date.now()}`, email: body.email, role: body.role ?? "MEMBER", expiresAt: ahead(7 * DAY) } }, 201);
  }
  if (path === "/api/team/invitations" && verb === "DELETE") return json({ revoked: true });
  if (path === "/api/help/analytics" && verb === "POST") return json({ ok: true });
  if ((path === "/api/sequences" || /^\/api\/sequences\/[^/]+$/.test(path)) && verb !== "DELETE") {
    return json({ data: { id: `seq_${Date.now()}`, status: "DRAFT", enrolledCount: 0, steps: [], ...body } });
  }
  if (/^\/api\/sequences\/[^/]+$/.test(path) && verb === "DELETE") return json({ deleted: true });
  if (path === "/api/broadcasts" && verb === "POST") {
    return json({ data: { broadcast: { id: `bc_${Date.now()}`, status: "PENDING", ...body }, audience: { eligible: 64, queued: 64, truncated: false } } }, 201);
  }
  if (/^\/api\/broadcasts\/[^/]+$/.test(path)) return json({ data: { status: "CANCELLED" } });
  return null;
}
