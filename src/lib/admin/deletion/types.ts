import type { SyntheticAccountInventoryItem } from "./synthetic-accounts";

export type DeletionTarget = { kind: "USER" | "WORKSPACE" | "SYNTHETIC_ACCOUNTS"; id: string };

/**
 * Facts that decide what a deletion removes and whether it is allowed. The
 * impact digest covers only these, so routine traffic (new contacts, webhook
 * events, deliveries) between preview and execution does not invalidate it.
 */
export type DeletionStructure = {
  target: DeletionTarget;
  /** Sorted user ids whose data or Auth identity the deletion touches. */
  memberUserIds: string[];
  /** Whether a platform owner is involved; previews reject protected targets. */
  protected: boolean;
  /** Workspace lifecycle status at preview time (ACTIVE or SUSPENDED). */
  workspaceStatus?: string;
  /** Sorted `workspaceId:role` memberships of a user target. */
  memberships?: string[];
};

export type DeletionImpact = {
  /** 1: legacy digest over every field including counts. 2: digest over `structure`. */
  version: 1 | 2;
  target: DeletionTarget;
  identity: { label: string };
  /** Informational row counts; not part of a version 2 digest. */
  counts: Record<string, number>;
  memberUserIds: string[];
  warnings: string[];
  syntheticAccounts?: SyntheticAccountInventoryItem[];
  structure?: DeletionStructure;
};

export type DeletionPreview = {
  impact: DeletionImpact;
  impactDigest: string;
  confirmationPhrase: string;
};
