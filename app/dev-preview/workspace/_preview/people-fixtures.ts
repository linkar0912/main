/**
 * Dev-only extra scenarios for the people screens (Inbox, Contacts, the
 * contact drawer, Settings, Profile). Picked with a second query parameter so
 * they never collide with the shared ?state= scenarios:
 *
 *   ?people=long     very long names, unbroken words, emoji, 200-character
 *                    messages and many rows (with a next page)
 *   ?people=fail     the people endpoints answer 500 (error states)
 *   ?people=loading  the people endpoints never answer (loading skeletons)
 *
 * Anything else falls through to the shared fixtures in ./fixtures.ts.
 */
import type { FixtureAnswer } from "./fixtures";

type PeopleScenario = "long" | "fail" | "loading";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const PEOPLE_PATHS = /^\/api\/(inbox|contacts|activity|billing|team\/(invitations|members)|meta\/connection|facebook\/connection|workspace\/messaging)(\/|$)/;

const LONG_WORD = "supercalifragilisticexpialidociouskurtas";
const LONG_MESSAGE = "Hi! I ordered the sage green mul cotton kurta last week for my sister's mehendi and the size M fits a little tight around the shoulders. Can I exchange it for an L before Saturday? 🙏🏽✨";

function scenario(): PeopleScenario | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("people");
  return value === "long" || value === "fail" || value === "loading" ? value : null;
}

function json(body: unknown, status = 200): FixtureAnswer {
  return { kind: "json", status, body };
}

function ago(ms: number, now = Date.now()): string {
  return new Date(now - ms).toISOString();
}

function avatar(initials: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="hsl(${hue} 55% 48%)"/><text x="48" y="58" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const MEMBERS = [
  { userId: "user_owner_tejas", email: "tejastelkar9@gmail.com", role: "OWNER" },
  { userId: "user_long", email: "priyadarshini.venkataraman.operations.lead@studiokavyaboutique.co.in", role: "ADMIN" },
  { userId: "user_kunal_dm", email: "kunal@studiokavya.in", role: "MEMBER" },
];

const HANDLES = [
  `${LONG_WORD}_official`,
  "ananya_reddy",
  "the.very.long.handle.of.a.creator.studio.2026",
  "rohan.k.verma",
  "🌸meera_iyer🌸",
  "aditi.joshi_",
];

function handleAt(index: number): string {
  return HANDLES[index] ?? `customer.${String(index).padStart(3, "0")}`;
}

function inboxList() {
  const now = Date.now();
  const contacts = Array.from({ length: 40 }, (_, index) => ({
    id: `long_${index}`,
    username: handleAt(index),
    avatarUrl: avatar(handleAt(index).replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "IG", (index * 47) % 360),
    preview: index % 3 === 0 ? LONG_MESSAGE : index % 3 === 1 ? `${LONG_WORD}${LONG_WORD}` : "Thank you! 😊",
    lastMessageAt: ago(index * 47 * MINUTE, now),
    canMessage: index % 4 !== 3,
    unread: index % 5 === 0,
    leadStatus: (["NEW", "ENGAGED", "QUALIFIED", "CUSTOMER"] as const)[index % 4],
    tags: index % 2 ? ["diwali", "repeat-buyer", "very-long-label-for-a-festive-campaign"] : [],
    inboxStatus: index % 7 === 6 ? "CLOSED" : "OPEN",
    favorite: index % 6 === 0,
    ...(index % 8 === 2 ? { reminderAt: ago(-5 * HOUR, now) } : {}),
    ...(index % 9 === 1 ? { assigneeUserId: "user_long" } : {}),
    ...(index % 10 === 4 ? { automationsPausedUntil: ago(-6 * HOUR, now) } : {}),
  }));
  return { data: { contacts, members: MEMBERS, nextCursor: "page_2" } };
}

function inboxThread(id: string) {
  const now = Date.now();
  const lines: Array<["inbound" | "outbound", string, number, string?]> = [
    ["inbound", "Hello 👋", 3 * DAY],
    ["outbound", "Hi! How can we help today?", 3 * DAY - 2 * MINUTE],
    ["inbound", LONG_MESSAGE, 26 * HOUR],
    ["inbound", `${LONG_WORD}${LONG_WORD}${LONG_WORD}`, 26 * HOUR - MINUTE],
    ["outbound", "Of course - exchanges are free within 7 days. I've booked a pickup for tomorrow between 10 am and 1 pm, and the L will ship the same day. 📦", 25 * HOUR],
    ["inbound", "Perfect thank you!!", 40 * MINUTE],
    ["outbound", "This one failed to send because the reply window closed.", 30 * MINUTE, "failed"],
  ];
  return {
    data: {
      messages: lines.map(([direction, text, msAgo, status], index) => ({
        id: `msg_${id}_${index}`,
        direction,
        text,
        at: ago(msAgo, now),
        status: status ?? (direction === "inbound" ? "received" : "sent"),
        ...(status === "failed" ? { error: "Instagram only allows replies within 24 hours of their last message.", clientKey: `key_${index}` } : {}),
      })),
      nextCursor: "older",
    },
  };
}

function contactsList() {
  const now = Date.now();
  const contacts = Array.from({ length: 60 }, (_, index) => ({
    id: `long_${index}`,
    instagramAccountId: "17841405822304914",
    igScopedUserId: `6900${index}`,
    instagramUsername: handleAt(index),
    avatarUrl: avatar("IG", (index * 47) % 360),
    ...(index % 2 ? { email: index === 1 ? "ananya.reddy.personal.shopping.enquiries@outlook.example.com" : `customer${index}@gmail.com` } : {}),
    state: index % 3 ? "CAPTURED" : "NONE",
    tags: index % 2 ? ["diwali", "repeat-buyer", "very-long-label-for-a-festive-campaign"] : [],
    score: (index * 7) % 90,
    leadStatus: (["NEW", "ENGAGED", "QUALIFIED", "CUSTOMER"] as const)[index % 4],
    ...(index % 3 === 1 ? { assigneeUserId: "user_long" } : {}),
    ...(index % 11 === 5 ? { suppressedAt: ago(DAY, now) } : {}),
    lastSeenAt: ago(index * 5 * HOUR, now),
    createdAt: ago(index * 6 * DAY + DAY, now),
  }));
  return { data: { count: contacts.length, counts: { NEW: 61, ENGAGED: 58, QUALIFIED: 57, CUSTOMER: 64 }, contacts, hasMore: true } };
}

function contactDetail(id: string) {
  const now = Date.now();
  const row = contactsList().data.contacts.find((contact) => contact.id === id) ?? contactsList().data.contacts[0];
  return {
    data: {
      contact: { ...row, notes: `${LONG_MESSAGE} ${LONG_WORD}`, sourceAutomationId: "auto_price_list", automationsPaused: true },
      timeline: Array.from({ length: 12 }, (_, index) => ({
        id: `t_${index}`,
        kind: "interaction",
        at: ago(index * 9 * HOUR, now),
        label: index % 2 ? "Campaign delivery sent" : "Email captured",
        detail: index % 3 === 0 ? `keyword "${LONG_WORD}"` : index % 3 === 1 ? "OPENING_SENT" : LONG_MESSAGE,
      })),
    },
  };
}

function facebookActivity() {
  const now = Date.now();
  return {
    data: {
      items: Array.from({ length: 30 }, (_, index) => ({
        id: `fb_long_${index}`,
        channel: "facebook",
        type: "facebook.comment.created",
        label: "Facebook Page comment",
        at: ago(index * 3 * HOUR, now),
        account: index % 2 ? "104829377551203" : "998877665544332",
        from: index % 3 ? "Lakshmi Narayanan Subramaniam Venkatachalam" : `${LONG_WORD} 🌺`,
        summary: index % 2 ? LONG_MESSAGE : `${LONG_WORD}${LONG_WORD}`,
      })),
      nextCursor: "page_2",
    },
  };
}

function team() {
  return {
    members: MEMBERS.map(({ email, role }) => ({ email, role })),
    invitations: [
      { id: "inv_long", email: "a.very.long.invitation.address.for.the.festive.team@studiokavyaboutique.co.in", role: "ADMIN", expiresAt: ago(-6 * DAY) },
      { id: "inv_short", email: "arjun@studiokavya.in", role: "MEMBER", expiresAt: ago(-2 * DAY) },
    ],
  };
}

/** Answers people-screen requests for the ?people= scenarios; null = not handled here. */
export function peopleAnswer(method: string, url: URL): FixtureAnswer | null {
  const mode = scenario();
  if (!mode) return null;
  const path = url.pathname.replace(/\/+$/, "");
  const verb = method.toUpperCase();
  if (verb !== "GET" || !PEOPLE_PATHS.test(path)) return null;
  if (mode === "loading") return { kind: "hang" };
  if (mode === "fail") return json({ error: "Linkar could not reach the server. Check your connection and try again." }, 500);

  if (path === "/api/inbox") return json(url.searchParams.get("cursor") ? { data: { contacts: [], members: MEMBERS } } : inboxList());
  const thread = /^\/api\/inbox\/([^/]+)$/.exec(path);
  if (thread) return json(inboxThread(decodeURIComponent(thread[1])));
  if (path === "/api/contacts") return json(contactsList());
  const contact = /^\/api\/contacts\/([^/]+)$/.exec(path);
  if (contact) return json(contactDetail(decodeURIComponent(contact[1])));
  if (path === "/api/activity") return json(facebookActivity());
  if (path === "/api/team/invitations") return json(team());
  if (path === "/api/team/members") return json({ data: MEMBERS });
  return null;
}
