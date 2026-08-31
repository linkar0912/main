export type BackfillUser = { id: string; email: string | null };
export type BackfillMember = { id: string; email: string; userId: string | null };

export function backfillMemberUserIds(input: {
  users: BackfillUser[];
  members: BackfillMember[];
}): {
  updates: Array<{ memberId: string; userId: string }>;
  alreadyBound: number;
  unmatched: number;
};
