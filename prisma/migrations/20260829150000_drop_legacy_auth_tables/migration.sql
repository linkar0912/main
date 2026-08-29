-- Supabase Auth now owns identity, passwords, and session/token lifecycle
-- (see src/lib/auth/session.ts and src/lib/supabase/*). Nothing in the
-- application reads or writes these tables anymore as of the Supabase Auth
-- migration - dropping them.

DROP TABLE IF EXISTS "AuthToken";
DROP TABLE IF EXISTS "RevokedSession";
DROP TABLE IF EXISTS "User";
