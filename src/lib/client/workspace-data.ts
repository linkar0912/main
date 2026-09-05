import type { ConnectionStatus, MemberRole } from "../repository";
import type { BillingCatalogPlan } from "../billing/types";

export type WorkspaceBootstrap = {
  email: string;
  role: MemberRole;
  plan: string;
  planName?: string;
  igAvatarUrl?: string | null;
  platformOwner: boolean;
  /**
   * Runtime SUPPORT_EMAIL, carried on the shell payload so the help centre can
   * render as a static client page instead of a force-dynamic server page that
   * blocks every navigation on a fresh server round trip.
   */
  supportEmail?: string;
  /**
   * "demo" when the deployment has no database or Redis configured. Config-only
   * on the server, so reading it here costs nothing - unlike /api/health, which
   * probes both dependencies on every call.
   */
  mode?: "demo" | "configured";
};

/**
 * The signed-in person's own account record. Separate from the shell bootstrap
 * because it needs a Supabase getUser() round trip for memberSince /
 * emailVerified, which no other page should have to wait on.
 */
export type AccountProfile = {
  id: string;
  email: string;
  workspaceId: string;
  role: MemberRole;
  plan: string;
  planName?: string;
  memberSince: string | null;
  emailVerified: boolean;
};

export type InstagramConnectionSummary = {
  id: string;
  igUserId: string;
  username: string;
  status: ConnectionStatus;
  connectedAt: string;
  profilePictureUrl?: string | null;
};

export type FacebookPageSummary = {
  id: string;
  pageId: string;
  pageName: string;
  status: ConnectionStatus;
  connectedAt: string;
  avatarUrl?: string;
};

export type TeamOverview = {
  members: Array<{ email: string; role: string }>;
  invitations: Array<{ id: string; email: string; role: string; expiresAt: string }>;
};

export type MessagingSettings = {
  startHour: number;
  endHour: number;
  timezone: string;
} | null;

export type BillingView = {
  catalog: BillingCatalogPlan[];
  canManage: boolean;
  billingConfigured: boolean;
  entitlementPlanKey: string;
  deliveriesUsed: number;
  subscription: null | {
    status: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    pendingPlanId?: string | null;
  };
};

export type InsightsDayPoint = { day: string; count: number };
export type InsightsOverview = {
  timeseries?: {
    participantsPerDay?: InsightsDayPoint[];
    sentPerDay?: InsightsDayPoint[];
  };
  capturedEmails?: number;
  optedOut?: number;
};

export type WorkspaceResourceKey =
  | "bootstrap"
  | "account-profile"
  | "instagram-connections"
  | "facebook-pages"
  | "team-overview"
  | "messaging-settings"
  | "billing"
  | "insights-overview";

type ClientCache<T> = {
  value?: T;
  pending?: Promise<T>;
  fetchedAt?: number;
  fetcher?: typeof fetch;
};

const FRESH_FOR_MS = 30_000;

const bootstrapCache: ClientCache<WorkspaceBootstrap> = {};
const accountProfileCache: ClientCache<AccountProfile> = {};
const connectionsCache: ClientCache<InstagramConnectionSummary[]> = {};
const facebookPagesCache: ClientCache<FacebookPageSummary[]> = {};
const teamOverviewCache: ClientCache<TeamOverview> = {};
const messagingSettingsCache: ClientCache<MessagingSettings> = {};
const billingCache: ClientCache<BillingView> = {};
const insightsOverviewCache: ClientCache<InsightsOverview> = {};

async function requestJson<T>(url: string, select: (payload: unknown) => T): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Could not load ${url}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return select(await response.json());
}

function wrappedData<T>(url: string): (payload: unknown) => T {
  return (payload) => {
    const data = (payload as { data?: T }).data;
    if (data === undefined) throw new Error(`Missing data from ${url}`);
    return data;
  };
}

function startRequest<T>(cache: ClientCache<T>, url: string, select: (payload: unknown) => T): Promise<T> {
  const pending = requestJson(url, select)
    .then((value) => {
      cache.value = value;
      cache.fetchedAt = Date.now();
      cache.pending = undefined;
      return value;
    })
    .catch((error: unknown) => {
      cache.pending = undefined;
      throw error;
    });
  cache.pending = pending;
  return pending;
}

function sharedRequest<T>(cache: ClientCache<T>, url: string, select: (payload: unknown) => T): Promise<T> {
  // A replaced fetch implementation indicates a new test/runtime boundary.
  // In the browser the native fetch reference stays stable for the session.
  if (cache.fetcher !== fetch) {
    cache.value = undefined;
    cache.pending = undefined;
    cache.fetchedAt = undefined;
    cache.fetcher = fetch;
  }
  if (cache.value !== undefined && cache.fetchedAt !== undefined) {
    if (Date.now() - cache.fetchedAt < FRESH_FOR_MS) return Promise.resolve(cache.value);
    if (!cache.pending) {
      // Keep confirmed content visible while a stale entry refreshes. The
      // rejection handler prevents an unavailable refresh from becoming an
      // unhandled promise; the last confirmed value stays available.
      void startRequest(cache, url, select).catch(() => undefined);
    }
    return Promise.resolve(cache.value);
  }
  if (cache.pending) return cache.pending;
  return startRequest(cache, url, select);
}

function forCaller<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException("The request was aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("The request was aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    void request.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function cachedRequest<T>(cache: ClientCache<T>, url: string, signal?: AbortSignal): Promise<T> {
  return forCaller(sharedRequest(cache, url, wrappedData<T>(url)), signal);
}

export function getWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  return cachedRequest(bootstrapCache, "/api/workspace/bootstrap");
}

export function getAccountProfile(): Promise<AccountProfile> {
  return cachedRequest(accountProfileCache, "/api/account");
}

export function getInstagramConnections(): Promise<InstagramConnectionSummary[]> {
  return cachedRequest(connectionsCache, "/api/meta/connection");
}

export function getFacebookPages(): Promise<FacebookPageSummary[]> {
  return cachedRequest(facebookPagesCache, "/api/facebook/connection");
}

export function getTeamOverview(signal?: AbortSignal): Promise<TeamOverview> {
  return forCaller(sharedRequest(teamOverviewCache, "/api/team/invitations", (payload) => {
    const result = payload as Partial<TeamOverview>;
    return { members: result.members ?? [], invitations: result.invitations ?? [] };
  }), signal);
}

export function getMessagingSettings(signal?: AbortSignal): Promise<MessagingSettings> {
  return cachedRequest(messagingSettingsCache, "/api/workspace/messaging", signal);
}

export function getBillingView(signal?: AbortSignal): Promise<BillingView> {
  return cachedRequest(billingCache, "/api/billing", signal);
}

export function getInsightsOverview(signal?: AbortSignal): Promise<InsightsOverview> {
  return forCaller(sharedRequest(insightsOverviewCache, "/api/insights?include=overview", (payload) => payload as InsightsOverview), signal);
}

function resetCache(cache: ClientCache<unknown>): void {
  cache.value = undefined;
  cache.pending = undefined;
  cache.fetchedAt = undefined;
  cache.fetcher = undefined;
}

export function invalidateWorkspaceResource(key: WorkspaceResourceKey): void {
  const caches: Record<WorkspaceResourceKey, ClientCache<unknown>> = {
    bootstrap: bootstrapCache,
    "account-profile": accountProfileCache,
    "instagram-connections": connectionsCache,
    "facebook-pages": facebookPagesCache,
    "team-overview": teamOverviewCache,
    "messaging-settings": messagingSettingsCache,
    billing: billingCache,
    "insights-overview": insightsOverviewCache,
  };
  resetCache(caches[key]);
}

/**
 * Force a fresh fetch of the workspace bootstrap, bypassing the in-memory
 * cache. Use after a role change, plan upgrade, or avatar update so the
 * sidebar reflects server state without a full page reload.
 */
export function refreshWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  invalidateWorkspaceResource("bootstrap");
  return getWorkspaceBootstrap();
}

/** Clear after connection mutations; the no-argument form is also useful at a
 * session boundary and keeps isolated component tests deterministic. */
export function clearWorkspaceDataCache(scope: "connections" | "all" = "all"): void {
  invalidateWorkspaceResource("instagram-connections");
  invalidateWorkspaceResource("facebook-pages");
  if (scope === "all") {
    invalidateWorkspaceResource("bootstrap");
    invalidateWorkspaceResource("account-profile");
    invalidateWorkspaceResource("team-overview");
    invalidateWorkspaceResource("messaging-settings");
    invalidateWorkspaceResource("billing");
    invalidateWorkspaceResource("insights-overview");
  }
}
