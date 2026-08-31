export type DeletionTarget = { kind: "USER" | "WORKSPACE"; id: string };

export type DeletionImpact = {
  version: 1;
  target: DeletionTarget;
  identity: { label: string };
  counts: Record<string, number>;
  memberUserIds: string[];
  warnings: string[];
};

export type DeletionPreview = {
  impact: DeletionImpact;
  impactDigest: string;
  confirmationPhrase: string;
};
