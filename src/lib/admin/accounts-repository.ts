import type { PlatformUserStatus, WorkspaceStatus } from "@/src/lib/repository";

export type CursorQuery = {
  limit?: number;
  cursor?: string | null;
  search?: string;
};

export type CursorPage<T> = { items: T[]; nextCursor: string | null };

export type AdminWorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  planKey: string;
  planName: string;
  memberCount: number;
  automationCount: number;
  instagramConnectionCount: number;
  facebookConnectionCount: number;
};

export type AdminWorkspaceDetail = AdminWorkspaceSummary & {
  suspendedAt?: string;
  suspendedReason?: string;
  deletionScheduledAt?: string;
  entitlementVersion?: number;
  members?: Array<{ userId?: string; email: string; role: string }>;
  instagramConnections?: Array<{ id: string; igUserId: string; username: string; status: string; connectedAt: string }>;
  facebookConnections?: Array<{ id: string; pageId: string; pageName: string; status: string; connectedAt: string }>;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  status: PlatformUserStatus;
  createdAt: string;
  lastSignInAt: string | null;
  workspaceCount: number;
};

export type AdminUserDetail = AdminUserSummary & {
  sessionInvalidBefore?: string;
  suspendedAt?: string;
  suspendedReason?: string;
  workspaces?: Array<{ id: string; name: string; status: WorkspaceStatus; role: string }>;
};

export interface AdminAccountsRepository {
  listAdminWorkspaces(query: CursorQuery): Promise<CursorPage<AdminWorkspaceSummary>>;
  getAdminWorkspace(id: string): Promise<AdminWorkspaceDetail | null>;
  listAdminUsers(query: CursorQuery): Promise<CursorPage<AdminUserSummary>>;
  getAdminUser(id: string): Promise<AdminUserDetail | null>;
}

export function boundedAdminLimit(limit?: number): number {
  return Math.min(100, Math.max(1, Math.floor(limit ?? 25)));
}
