export type AdminIntegrationProvider = "instagram" | "facebook";
export type TokenExpiryBucket = "expired" | "within_24_hours" | "within_7_days" | "within_30_days" | "later" | "unknown";
export type SubscriptionHealth = "healthy" | "drifted" | "unchecked" | "unavailable";
export type AdminIntegrationItem = { id: string; provider: AdminIntegrationProvider; workspace: { id: string; name: string }; accountId: string; accountName: string; status: string; version: number; tokenExpiry: TokenExpiryBucket; tokenExpiresAt: string | null; connectedAt: string; subscriptionHealth: SubscriptionHealth; allowedActions: string[] };
export type AdminIntegrationDetail = AdminIntegrationItem & { subscribedFields: string[]; missingFields: string[]; checkedAt: string; safeErrorCode?: string };
