-- Facebook Page comments are part of the shipped product. The original free
-- plan was created before Facebook entitlement enforcement and accidentally
-- disabled the connection, so bring persisted workspaces in line with the
-- default entitlement used by the application.
UPDATE "PlanDefinition"
SET
  "facebookConnectionLimit" = 1,
  "facebookEnabled" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'free'
  AND "facebookEnabled" = FALSE
  AND "facebookConnectionLimit" = 0;
