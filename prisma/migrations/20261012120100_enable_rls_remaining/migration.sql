-- Four tables created after 20260829180000_enable_rls never had row level
-- security switched on, so Supabase's PostgREST roles were not default-deny
-- for them. Enabling it is idempotent and does not affect the app, whose own
-- Postgres role owns the tables (owners bypass RLS; FORCE is not set).
ALTER TABLE "FacebookPageConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FacebookReplyRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PremiumInviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PremiumInviteRedemption" ENABLE ROW LEVEL SECURITY;
