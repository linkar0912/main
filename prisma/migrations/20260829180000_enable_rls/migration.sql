-- Supabase exposes every table in `public` to PostgREST (anon/authenticated
-- roles) regardless of how Prisma connects. Enable RLS with no policies on
-- every app table so that surface is default-deny; the app's own Postgres
-- role (table owner) is unaffected since owners bypass RLS unless FORCE is
-- also set, which we deliberately do not set here.

-- The preceding Supabase Auth migration removes the legacy User, AuthToken,
-- and RevokedSession tables. Keep this list limited to tables that still
-- exist so a fresh database can apply the complete migration history.
ALTER TABLE "WorkspaceInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstagramConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackedLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackedLinkClick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SequenceEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Broadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationDailySendCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataDeletionRequest" ENABLE ROW LEVEL SECURITY;
