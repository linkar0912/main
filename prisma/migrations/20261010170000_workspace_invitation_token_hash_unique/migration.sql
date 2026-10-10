-- The schema has always declared WorkspaceInvitation.tokenHash @unique (the
-- invite lookup relies on it), but no migration ever created the index.
-- Token hashes are SHA-256 of random tokens, so duplicates are not expected;
-- the table is small, so a plain build is fine.
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");
