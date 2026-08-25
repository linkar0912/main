-- Contact engagement (tags + score) and A/B variant attribution.
ALTER TABLE "AutomationContact" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AutomationContact" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AutomationParticipant" ADD COLUMN "variantLabel" TEXT;
