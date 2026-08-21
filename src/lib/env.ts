export type ServerEnv = {
  appName: string;
  appUrl: string;
  supportEmail: string;
  databaseUrl?: string;
  redisUrl?: string;
  metaAppId?: string;
  metaAppSecret?: string;
  metaTokenEncryptionKey?: string;
  metaRedirectUri: string;
  metaVerifyToken: string;
  metaApiVersion: string;
  metaScopes: string[];
  followGatedCampaignsEnabled: boolean;
  authSessionSecret: string;
  trustedProxyHops: number;
  workerConcurrency: number;
  dispatchLeaseMs: number;
};

function booleanEnv(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("FOLLOW_GATED_CAMPAIGNS_ENABLED must be true or false");
}

function integerEnv(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

export function getServerEnv(): ServerEnv {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const metaRedirectUri =
    process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/meta/oauth/callback";
  const metaApiVersion = process.env.META_API_VERSION ?? "v25.0";

  // Fail fast on malformed values instead of discovering them at request time.
  // Demo mode is unaffected: every validated value has a valid default.
  for (const [name, value] of [["NEXT_PUBLIC_APP_URL", appUrl], ["META_REDIRECT_URI", metaRedirectUri]] as const) {
    try {
      new URL(value);
    } catch {
      throw new Error(`${name} must be a valid URL (got "${value}")`);
    }
  }
  if (!/^v\d+\.\d+$/.test(metaApiVersion)) {
    throw new Error(`META_API_VERSION must look like "v25.0" (got "${metaApiVersion}")`);
  }

  return {
    appName: process.env.APP_NAME ?? "ReplyConnect",
    appUrl,
    supportEmail: process.env.SUPPORT_EMAIL ?? "support@replyconnect.in",
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    metaAppId: process.env.META_APP_ID || undefined,
    metaAppSecret: process.env.META_APP_SECRET || undefined,
    metaTokenEncryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY || undefined,
    metaRedirectUri,
    metaVerifyToken: process.env.META_VERIFY_TOKEN ?? "change-me",
    metaApiVersion,
    metaScopes: (process.env.META_SCOPES ??
      "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    followGatedCampaignsEnabled: booleanEnv(process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED),
    // Sessions are signed with one app-level secret. OWNER_SESSION_SECRET is accepted
    // as a fallback so existing deployments keep working through the rename.
    authSessionSecret:
      process.env.AUTH_SESSION_SECRET?.trim()
      ?? process.env.OWNER_SESSION_SECRET?.trim()
      ?? "dev-insecure-session-secret-change-me-32ch",
    trustedProxyHops: integerEnv("TRUSTED_PROXY_HOPS", process.env.TRUSTED_PROXY_HOPS, 0),
    workerConcurrency: integerEnv("WORKER_CONCURRENCY", process.env.WORKER_CONCURRENCY, 5),
    dispatchLeaseMs: integerEnv("DISPATCH_LEASE_MS", process.env.DISPATCH_LEASE_MS, 30_000),
  };
}