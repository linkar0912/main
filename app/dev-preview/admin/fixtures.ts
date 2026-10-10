// Realistic owner-console data for the development-only preview routes. Pure
// fixtures: no data loaders, no database, no network.
import type { AdminUserDetail, AdminUserSummary, AdminWorkspaceDetail, AdminWorkspaceSummary, CursorPage } from "@/src/lib/admin/accounts-repository";
import type { AdminIntegrationItem } from "@/src/lib/admin/integrations/types";
import type { AdminOperationItem } from "@/src/lib/admin/operations/types";
import type { AdminOverviewDTO } from "@/src/lib/admin/overview";
import type { AdminSystemSnapshot } from "@/src/lib/admin/system/types";

const MINUTE = 60_000;
export function ago(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}
export function ahead(minutes: number): string {
  return new Date(Date.now() + minutes * MINUTE).toISOString();
}

export const OWNER_EMAIL = "tejas@linkar.in";
const RELEASE = "e4afaee1c0d8b5f27a9e61d3b4c58f0a92e7d1c6";

const W = {
  acme: "workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c",
  bloom: "workspace_1c7a2e55-08b1-4f6d-9e3a-7d4b2c1f9e01",
  chai: "workspace_6b2d9f14-3e8a-4a7c-b5d1-0f9e8c7b6a52",
  dhruv: "workspace_a41f0e3b-7c25-4d9a-8e16-5b3c2d1a0f77",
  ember: "workspace_3e8c1b9d-2f4a-4b6e-a7c0-9d8e7f6a5b43",
};

export const overview: AdminOverviewDTO = {
  generatedAt: ago(0),
  workspaces: { active: 128, suspended: 3 },
  users: { active: 214 },
  connections: { instagram: 97, facebook: 41 },
  automations: { active: 362 },
  health: { status: "ok", release: RELEASE, database: "ok", redis: "ok", instagram: "configured", facebook: "configured" },
  queue: { state: "ok", waiting: 4, active: 2, delayed: 1, failed: 3 },
  operatorTape: [
    { id: "a1", kind: "audit", at: ago(6), title: "security.factor.verify", detail: "Daily sign-in", status: "success", workspaceId: null, workspaceName: null, actor: OWNER_EMAIL, targetId: "factor" },
    { id: "f1", kind: "failure", at: ago(22), title: "Automation delivery failed", detail: "PROVIDER_REJECTED", status: "failed", workspaceId: W.bloom, workspaceName: "Bloom Skincare", actor: null, targetId: "automation_1" },
    { id: "a2", kind: "audit", at: ago(95), title: "premium_invite.create", detail: "October creator cohort", status: "success", workspaceId: null, workspaceName: null, actor: OWNER_EMAIL, targetId: "invite" },
    { id: "a3", kind: "audit", at: ago(180), title: "workspace.suspend", detail: "Repeated spam reports from Meta", status: "success", workspaceId: W.ember, workspaceName: "Ember Fitness", actor: OWNER_EMAIL, targetId: W.ember },
    { id: "a4", kind: "audit", at: ago(60 * 21), title: "integration.refresh_token", detail: "Customer reported replies stopped", status: "failed", workspaceId: W.chai, workspaceName: "Chai Point Studio", actor: OWNER_EMAIL, targetId: "ig_1" },
    { id: "a5", kind: "audit", at: ago(60 * 26), title: "workspace.entitlement.update", detail: "Upgrade agreed on support call", status: "success", workspaceId: W.acme, workspaceName: "Acme Studio", actor: OWNER_EMAIL, targetId: W.acme },
    { id: "a6", kind: "audit", at: ago(60 * 50), title: "operation.automation.pause", detail: "Loop reported by customer", status: "success", workspaceId: W.dhruv, workspaceName: "Dhruv Makes", actor: OWNER_EMAIL, targetId: "automation_2" },
  ],
};

export const workspaces: CursorPage<AdminWorkspaceSummary> = {
  nextCursor: "next",
  items: [
    { id: W.acme, name: "Acme Studio", slug: "acme-studio", status: "ACTIVE", createdAt: ago(60 * 24 * 120), updatedAt: ago(40), version: 7, planKey: "growth", planName: "Growth", memberCount: 4, automationCount: 18, instagramConnectionCount: 2, facebookConnectionCount: 1 },
    { id: W.bloom, name: "Bloom Skincare", slug: "bloom-skincare", status: "ACTIVE", createdAt: ago(60 * 24 * 64), updatedAt: ago(300), version: 3, planKey: "creator", planName: "Creator", memberCount: 2, automationCount: 6, instagramConnectionCount: 1, facebookConnectionCount: 0 },
    { id: W.chai, name: "Chai Point Studio", slug: "chai-point", status: "ACTIVE", createdAt: ago(60 * 24 * 30), updatedAt: ago(60 * 20), version: 2, planKey: "agency", planName: "Agency", memberCount: 9, automationCount: 41, instagramConnectionCount: 5, facebookConnectionCount: 3 },
    { id: W.dhruv, name: "Dhruv Makes", slug: "dhruv-makes", status: "ACTIVE", createdAt: ago(60 * 24 * 9), updatedAt: ago(60 * 48), version: 1, planKey: "free", planName: "Free", memberCount: 1, automationCount: 2, instagramConnectionCount: 1, facebookConnectionCount: 0 },
    { id: W.ember, name: "Ember Fitness", slug: "ember-fitness", status: "SUSPENDED", createdAt: ago(60 * 24 * 200), updatedAt: ago(180), version: 12, planKey: "growth", planName: "Growth", memberCount: 3, automationCount: 11, instagramConnectionCount: 1, facebookConnectionCount: 1 },
  ],
};

export const workspaceDetail: AdminWorkspaceDetail = {
  ...workspaces.items[0],
  entitlementVersion: 3,
  members: [
    { userId: "8d3f2a10-55b1-4c2e-9f0a-7b6c5d4e3f21", email: "aanya@acmestudio.in", role: "OWNER" },
    { userId: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d", email: "rohan@acmestudio.in", role: "ADMIN" },
    { email: "new.hire@acmestudio.in", role: "MEMBER" },
  ],
  instagramConnections: [
    { id: "ig_conn_1", igUserId: "17841400008460056", username: "acmestudio", status: "CONNECTED", connectedAt: ago(60 * 24 * 100) },
    { id: "ig_conn_2", igUserId: "17841400008460099", username: "acme.shop", status: "EXPIRED", connectedAt: ago(60 * 24 * 80) },
  ],
  facebookConnections: [
    { id: "fb_conn_1", pageId: "104998812345678", pageName: "Acme Studio", status: "CONNECTED", connectedAt: ago(60 * 24 * 90) },
  ],
};

export const workspaceEntitlement = {
  plan: { id: "plan_growth", key: "growth", name: "Growth" },
  effectivePlan: { id: "plan_growth", key: "growth", name: "Growth" },
  premiumExpiresAt: null,
  defaults: {},
  overrides: { monthlyDeliveryLimit: 30000 },
  effective: { memberLimit: 5, automationLimit: 25, instagramConnectionLimit: 3, facebookConnectionLimit: 2, monthlyDeliveryLimit: 30000, broadcastsEnabled: true, exportsEnabled: false, sequenceLimit: null },
  version: 3,
  usage: { deliveriesReserved: 18432, broadcastsCreated: 6, periodStart: ago(60 * 24 * 10) },
};

export const plansForWorkspace = [
  { id: "plan_free", key: "free", name: "Free", isActive: true },
  { id: "plan_creator", key: "creator", name: "Creator", isActive: true },
  { id: "plan_growth", key: "growth", name: "Growth", isActive: true },
  { id: "plan_agency", key: "agency", name: "Agency", isActive: true },
];

export const users: CursorPage<AdminUserSummary> = {
  nextCursor: null,
  items: [
    { id: "8d3f2a10-55b1-4c2e-9f0a-7b6c5d4e3f21", email: "aanya@acmestudio.in", status: "ACTIVE", createdAt: ago(60 * 24 * 120), lastSignInAt: ago(35), workspaceCount: 2 },
    { id: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d", email: "rohan@acmestudio.in", status: "ACTIVE", createdAt: ago(60 * 24 * 90), lastSignInAt: ago(60 * 26), workspaceCount: 1 },
    { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", email: "meera@bloomskincare.com", status: "ACTIVE", createdAt: ago(60 * 24 * 64), lastSignInAt: ago(60 * 24 * 4), workspaceCount: 1 },
    { id: "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f6a7b8", email: "coach@emberfitness.in", status: "SUSPENDED", createdAt: ago(60 * 24 * 200), lastSignInAt: ago(60 * 24 * 40), workspaceCount: 1 },
    { id: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f", email: "invited.person@gmail.com", status: "ACTIVE", createdAt: ago(60 * 3), lastSignInAt: null, workspaceCount: 0 },
  ],
};

export const userDetail: AdminUserDetail = {
  ...users.items[0],
  sessionInvalidBefore: undefined,
  authBannedUntil: null,
  workspaces: [
    { id: W.acme, name: "Acme Studio", status: "ACTIVE", role: "OWNER" },
    { id: W.chai, name: "Chai Point Studio", status: "ACTIVE", role: "MEMBER" },
  ],
};

const planBase = {
  sequencesEnabled: true, broadcastsEnabled: true, trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true,
};
export const plans = [
  { id: "plan_free", key: "free", name: "Free", isActive: true, version: 4, workspaceCount: 61, memberLimit: 1, automationLimit: 3, instagramConnectionLimit: 1, facebookConnectionLimit: 0, sequenceLimit: 0, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 1000, ...planBase, sequencesEnabled: false, broadcastsEnabled: false, trackedLinksEnabled: false, teamEnabled: false, facebookEnabled: false, exportsEnabled: false },
  { id: "plan_creator", key: "creator", name: "Creator", isActive: true, version: 6, workspaceCount: 38, memberLimit: 2, automationLimit: 10, instagramConnectionLimit: 1, facebookConnectionLimit: 1, sequenceLimit: 3, monthlyBroadcastLimit: 4, monthlyDeliveryLimit: 10000, ...planBase, teamEnabled: false, exportsEnabled: false },
  { id: "plan_growth", key: "growth", name: "Growth", isActive: true, version: 9, workspaceCount: 22, memberLimit: 5, automationLimit: 25, instagramConnectionLimit: 3, facebookConnectionLimit: 2, sequenceLimit: 10, monthlyBroadcastLimit: 12, monthlyDeliveryLimit: 25000, ...planBase },
  { id: "plan_agency", key: "agency", name: "Agency", isActive: false, version: 3, workspaceCount: 7, memberLimit: null, automationLimit: null, instagramConnectionLimit: 10, facebookConnectionLimit: 10, sequenceLimit: null, monthlyBroadcastLimit: null, monthlyDeliveryLimit: 100000, ...planBase },
];

export const inviteCodes = [
  { id: "inv_1", label: "October creator cohort", durationDays: 30, expiresAt: ahead(60 * 24 * 20), revokedAt: null, createdAt: ago(95), plan: { key: "growth", name: "Growth" }, redemption: null },
  { id: "inv_2", label: "Podcast guest gift", durationDays: 30, expiresAt: null, revokedAt: null, createdAt: ago(60 * 24 * 12), plan: { key: "creator", name: "Creator" }, redemption: { workspaceId: W.bloom, startsAt: ago(60 * 24 * 11), expiresAt: ahead(60 * 24 * 19), createdAt: ago(60 * 24 * 11) } },
  { id: "inv_3", label: "Launch week", durationDays: 30, expiresAt: ago(60 * 24 * 3), revokedAt: null, createdAt: ago(60 * 24 * 40), plan: { key: "growth", name: "Growth" }, redemption: null },
];

export const operations: AdminOperationItem[] = [
  { id: "automation_6c67f1e2-4b3a-4d5c-9e8f-7a6b5c4d3e2f", kind: "automation", workspace: { id: W.acme, name: "Acme Studio" }, title: "Diwali giveaway replies", status: "ACTIVE", provider: "instagram", version: 14, createdAt: ago(60 * 24 * 20), updatedAt: ago(42) },
  { id: "automation_1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", kind: "automation", workspace: { id: W.bloom, name: "Bloom Skincare" }, title: "Price in DM", status: "PAUSED", provider: "instagram", version: 6, createdAt: ago(60 * 24 * 40), updatedAt: ago(60 * 5) },
  { id: "automation_9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a", kind: "automation", workspace: { id: W.chai, name: "Chai Point Studio" }, title: "Comment to menu link", status: "ACTIVE", provider: "facebook", version: 3, createdAt: ago(60 * 24 * 8), updatedAt: ago(60 * 26) },
  { id: "automation_0d1c2b3a-4e5f-4061-9728-3a4b5c6d7e8f", kind: "automation", workspace: { id: W.dhruv, name: "Dhruv Makes" }, title: "Workshop waitlist", status: "DRAFT", provider: "instagram", version: 1, createdAt: ago(60 * 24 * 2), updatedAt: ago(60 * 24 * 2) },
];

export const integrations: AdminIntegrationItem[] = [
  { id: "ig_conn_1", provider: "instagram", workspace: { id: W.acme, name: "Acme Studio" }, accountId: "17841400008460056", accountName: "@acmestudio", status: "CONNECTED", version: 4, tokenExpiry: "later", tokenExpiresAt: ahead(60 * 24 * 48), connectedAt: ago(60 * 24 * 100), subscriptionHealth: "healthy", allowedActions: ["refresh_token", "disconnect"] },
  { id: "ig_conn_2", provider: "instagram", workspace: { id: W.acme, name: "Acme Studio" }, accountId: "17841400008460099", accountName: "@acme.shop", status: "EXPIRED", version: 7, tokenExpiry: "expired", tokenExpiresAt: ago(60 * 24 * 2), connectedAt: ago(60 * 24 * 80), subscriptionHealth: "unchecked", allowedActions: ["disconnect"] },
  { id: "fb_conn_1", provider: "facebook", workspace: { id: W.chai, name: "Chai Point Studio" }, accountId: "104998812345678", accountName: "Chai Point Studio", status: "CONNECTED", version: 2, tokenExpiry: "within_7_days", tokenExpiresAt: ahead(60 * 24 * 4), connectedAt: ago(60 * 24 * 30), subscriptionHealth: "drifted", allowedActions: ["refresh_token", "repair_subscription", "disconnect"] },
  { id: "ig_conn_3", provider: "instagram", workspace: { id: W.bloom, name: "Bloom Skincare" }, accountId: "17841400001234567", accountName: "@bloom.skin", status: "CONNECTED", version: 1, tokenExpiry: "unknown", tokenExpiresAt: null, connectedAt: ago(60 * 24 * 64), subscriptionHealth: "healthy", allowedActions: ["refresh_token", "disconnect"] },
];

export const systemSnapshot: AdminSystemSnapshot = {
  overall: "healthy",
  generatedAt: ago(0),
  release: RELEASE,
  web: { state: "healthy" },
  database: { state: "healthy" },
  redis: { state: "healthy" },
  worker: { state: "healthy", release: RELEASE, lastSeenAt: ago(0.4) },
  queues: [
    { name: "webhooks", configured: true, paused: false, waiting: 3, active: 2, delayed: 0, completed: 18234, failed: 2, oldestWaitingAgeMs: 4_000, lastFailedCode: "PROVIDER_REJECTED" },
    { name: "bulk", configured: true, paused: false, waiting: 0, active: 0, delayed: 1, completed: 4120, failed: 0, oldestWaitingAgeMs: null, lastFailedCode: null },
  ],
  stuckClaims: 0,
  webhookThroughput: { lastHour: 1284 },
  deletionJobs: { queued: 0, running: 1, failed: 0 },
  billing: { configured: true, failedWebhooksLastHour: 0, driftedSubscriptions: 1 },
  incidents: [
    { id: "inc_1", severity: "WARNING", status: "RESOLVED", source: "queue:webhooks", title: "Message queue backed up", detail: "More than 500 events were waiting for over 5 minutes.", firstSeenAt: ago(60 * 9), lastSeenAt: ago(60 * 8.6), resolvedAt: ago(60 * 8.6), occurrenceCount: 3 },
  ],
  operationalDataAvailable: true,
  configurationPresence: [
    { requirement: "Database", present: true },
    { requirement: "Redis", present: true },
    { requirement: "Instagram app", present: true },
    { requirement: "Facebook app", present: true },
    { requirement: "Token encryption", present: true },
    { requirement: "Platform owner allowlist", present: true },
    { requirement: "Razorpay billing", present: true },
    { requirement: "Owner email alerts", present: false, fix: "Set EMAIL_API_KEY, EMAIL_FROM and PLATFORM_ALERT_EMAILS (a comma-separated list of owner addresses) on the web server, then redeploy." },
  ],
  capabilities: { followGatedCampaigns: "enabled" },
  reconciliation: { expiredDeliveryClaims: 0 },
  rateLimits: { state: "healthy" },
};

export const deletionJobs = [
  { id: "deljob_1", targetKind: "WORKSPACE", targetId: W.ember, state: "RUNNING", currentStage: "DELETE_CONTACTS", progress: 46, irreversibleAt: ago(12), terminalErrorCode: null, createdAt: ago(20) },
  { id: "deljob_2", targetKind: "USER", targetId: "2f3e4d5c-6b7a-4980-a1b2-c3d4e5f6a7b8", state: "FAILED", currentStage: "DELETE_AUTH_USER", progress: 90, irreversibleAt: ago(60 * 24), terminalErrorCode: "auth_provider_unavailable", createdAt: ago(60 * 25) },
  { id: "deljob_3", targetKind: "WORKSPACE", targetId: "workspace_77aa88bb-99cc-4dde-8eff-001122334455", state: "COMPLETED", currentStage: null, progress: 100, irreversibleAt: ago(60 * 24 * 6), terminalErrorCode: null, createdAt: ago(60 * 24 * 6) },
];

export const auditEvents = [
  { id: "audit_1", requestId: "admin_req_7a1b2c3d4e5f6a7b8c9d", phase: "SUCCESS", actorEmail: OWNER_EMAIL, action: "security.factor.verify", targetType: "mfa_factor", targetId: "factor_1", workspaceId: null, reason: "Verify owner MFA", before: null, after: { verified: true }, errorCode: null, origin: "https://admin.linkar.in", createdAt: ago(6) },
  { id: "audit_2", requestId: "admin_req_8b2c3d4e5f6a7b8c9d0e", phase: "SUCCESS", actorEmail: OWNER_EMAIL, action: "premium_invite.create", targetType: "premium_invite", targetId: "October creator cohort", workspaceId: null, reason: "October creator cohort", before: null, after: { plan: "growth", durationDays: 30 }, errorCode: null, origin: "https://admin.linkar.in", createdAt: ago(95) },
  { id: "audit_3", requestId: "admin_req_9c3d4e5f6a7b8c9d0e1f", phase: "SUCCESS", actorEmail: OWNER_EMAIL, action: "workspace.suspend", targetType: "workspace", targetId: W.ember, workspaceId: W.ember, reason: "Repeated spam reports from Meta", before: { status: "ACTIVE" }, after: { status: "SUSPENDED" }, errorCode: null, origin: "https://admin.linkar.in", createdAt: ago(180) },
  { id: "audit_4", requestId: "admin_req_0d4e5f6a7b8c9d0e1f2a", phase: "FAILURE", actorEmail: OWNER_EMAIL, action: "integration.refresh_token", targetType: "instagram_connection", targetId: "ig_conn_2", workspaceId: W.chai, reason: "Customer reported replies stopped", before: null, after: null, errorCode: "token_refresh_rejected", origin: "https://admin.linkar.in", createdAt: ago(60 * 21) },
  { id: "audit_5", requestId: "admin_req_1e5f6a7b8c9d0e1f2a3b", phase: "SUCCESS", actorEmail: OWNER_EMAIL, action: "operation.automation.pause", targetType: "automation", targetId: "automation_1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", workspaceId: W.bloom, reason: "Loop reported by customer", before: { status: "ACTIVE" }, after: { status: "PAUSED" }, errorCode: null, origin: "https://admin.linkar.in", createdAt: ago(60 * 50) },
];

export const dataDeletionRequests = [
  { id: "ddr_5f2a9c1e7b3d4a68", status: "completed", requestedAt: ago(60 * 24 * 3), completedAt: ago(60 * 24 * 3 - 4) },
  { id: "ddr_0b7e4d2c9a1f3e56", status: "pending", requestedAt: ago(60 * 2), completedAt: null },
];
