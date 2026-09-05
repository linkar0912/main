import type { SyntheticAccountInventoryItem } from "./synthetic-accounts";

export type DeletionTarget = { kind: "USER" | "WORKSPACE" | "SYNTHETIC_ACCOUNTS"; id: string };

export type DeletionImpact = {
  version: 1;
  target: DeletionTarget;
  identity: { label: string };
  counts: Record<string, number>;
  memberUserIds: string[];
  warnings: string[];
  syntheticAccounts?: SyntheticAccountInventoryItem[];
};

export type DeletionPreview = {
  impact: DeletionImpact;
  impactDigest: string;
  confirmationPhrase: string;
};
