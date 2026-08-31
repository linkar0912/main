import type { ConnectionStatus, MemberRole } from "../repository";

export type WorkspaceBootstrap = {
  email: string;
  role: MemberRole;
  plan: string;
  planName?: string;
  igAvatarUrl?: string | null;
  platformOwner: boolean;
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
};

type ClientCache<T> = { value?: T; pending?: Promise<T>; fetcher?: typeof fetch };

const bootstrapCache: ClientCache<WorkspaceBootstrap> = {};
const connectionsCache: ClientCache<InstagramConnectionSummary[]> = {};
const facebookPagesCache: ClientCache<FacebookPageSummary[]> = {};

async function requestData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  const payload = await response.json() as { data?: T };
  if (payload.data === undefined) throw new Error(`Missing data from ${url}`);
  return payload.data;
}

function cachedRequest<T>(cache: ClientCache<T>, url: string): Promise<T> {
  // A replaced fetch implementation indicates a new test/runtime boundary.
  // In the browser the native fetch reference stays stable for the session.
  if (cache.fetcher !== fetch) {
    cache.value = undefined;
    cache.pending = undefined;
    cache.fetcher = fetch;
  }
  if (cache.value !== undefined) return Promise.resolve(cache.value);
  if (cache.pending) return cache.pending;
  cache.pending = requestData<T>(url)
    .then((value) => {
      cache.value = value;
      cache.pending = undefined;
      return value;
    })
    .catch((error: unknown) => {
      cache.pending = undefined;
      throw error;
    });
  return cache.pending;
}

export function getWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  return cachedRequest(bootstrapCache, "/api/workspace/bootstrap");
}

export function getInstagramConnections(): Promise<InstagramConnectionSummary[]> {
  return cachedRequest(connectionsCache, "/api/meta/connection");
}

export function getFacebookPages(): Promise<FacebookPageSummary[]> {
  return cachedRequest(facebookPagesCache, "/api/facebook/connection");
}

/**
 * Force a fresh fetch of the workspace bootstrap, bypassing the in-memory
 * cache. Use after a role change, plan upgrade, or avatar update so the
 * sidebar reflects server state without a full page reload.
 */
export function refreshWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  bootstrapCache.value = undefined;
  bootstrapCache.pending = undefined;
  return getWorkspaceBootstrap();
}

/** Clear after connection mutations; the no-argument form is also useful at a
 * session boundary and keeps isolated component tests deterministic. */
export function clearWorkspaceDataCache(scope: "connections" | "all" = "all"): void {
  connectionsCache.value = undefined;
  connectionsCache.pending = undefined;
  connectionsCache.fetcher = undefined;
  facebookPagesCache.value = undefined;
  facebookPagesCache.pending = undefined;
  facebookPagesCache.fetcher = undefined;
  if (scope === "all") {
    bootstrapCache.value = undefined;
    bootstrapCache.pending = undefined;
    bootstrapCache.fetcher = undefined;
  }
}
