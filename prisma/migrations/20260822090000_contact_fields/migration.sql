-- Conversational custom fields on contacts.
ALTER TYPE "ContactState" ADD VALUE 'AWAITING_FIELD';
ALTER TABLE "AutomationContact" ADD COLUMN "fields" JSONB;
ALTER TABLE "AutomationContact" ADD COLUMN "awaitingFields" JSONB;
