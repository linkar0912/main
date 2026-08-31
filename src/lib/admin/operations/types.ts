export const adminOperationKinds = ["automation", "sequence", "broadcast", "contact", "tracked_link", "delivery", "webhook"] as const;
export type AdminOperationKind = typeof adminOperationKinds[number];

export type AdminOperationFilter = {
  workspaceId?: string;
  status?: string;
  text?: string;
  provider?: "instagram" | "facebook";
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
};

export type AdminOperationItem = {
  id: string;
  kind: AdminOperationKind;
  workspace: { id: string; name: string };
  title: string;
  status: string;
  provider?: "instagram" | "facebook";
  version: number;
  createdAt: string;
  updatedAt: string;
  metrics?: Record<string, number>;
  safeErrorCode?: string;
};

export type AdminOperationDetail = AdminOperationItem & {
  attributes: Record<string, string | number | boolean | null>;
  allowedActions: string[];
};

export type AdminOperationPage<T = AdminOperationItem> = { items: T[]; nextCursor: string | null };
