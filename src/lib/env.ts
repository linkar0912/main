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
  // Facebook Page support. Kept distinct from `meta*` so the Instagram
  // Business Login config (and its Meta App Review) is never disturbed. Both
  // backends can be configured simultaneously; absence of the FB keys just
  // hides the Connect button on the settings page.
  facebookAppId?: string;
  facebookAppSecret?: string;
  facebookTokenEncryptionKey?: string;
  facebookRedirectUri: string;
  facebookVerifyToken: string;
  facebookApiVersion: string;
  facebookScopes: string[];
  followGatedCampaignsEnabled: boolean;
  authSessionSecret: string;
  trustedProxyHops: number;
  workerConcurrency: number;
  dispatchLeaseMs: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceRoleKey: string;
};

function booleanEnv(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("FOLLOW_GATED_CAMPAIGNS_ENABLED must be true or false");
}

function optionalHexEncryptionKey(value: string | undefined, envName: string): string | undefined {
  if (!value) return undefined;
  // 64 hex chars = 32 bytes, the AES-256-GCM key size used by sealSecret.
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${envName} must be 64 hex characters when set`);
  }
  return value;
}

function integerEnv(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    // Include the offending value so operators can spot the misconfiguration
    // from the error log without re-deriving it from the environment dump.
    throw new Error(`${name} must be a non-negative integer (got "${value}")`);
  }
  return parsed;
}

export function getServerEnv(): ServerEnv {
  // NEXT_PUBLIC_* values are frozen by Next.js during `next build`. Prefer a
  // server-only variable so one container image can be configured correctly
  // at runtime by Coolify.
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const metaRedirectUri =
    process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/meta/oauth/callback";
  const metaApiVersion = process.env.META_API_VERSION ?? "v25.0";
  const facebookRedirectUri =
    process.env.FACEBOOK_REDIRECT_URI ?? "http://localhost:3000/api/facebook/oauth/callback";
  const facebookApiVersion = process.env.FACEBOOK_API_VERSION ?? "v25.0";

  // Fail fast on malformed values instead of discovering them at request time.
  // Demo mode is unaffected: every validated value has a valid default.
  for (const [name, value] of [
    ["APP_URL", appUrl],
    ["META_REDIRECT_URI", metaRedirectUri],
    ["FACEBOOK_REDIRECT_URI", facebookRedirectUri],
  ] as const) {
    try {
      new URL(value);
    } catch {
      throw new Error(`${name} must be a valid URL (got "${value}")`);
    }
  }
  if (!/^v\d+\.\d+$/.test(metaApiVersion)) {
    throw new Error(`META_API_VERSION must look like "v25.0" (got "${metaApiVersion}")`);
  }
  if (!/^v\d+\.\d+$/.test(facebookApiVersion)) {
    throw new Error(`FACEBOOK_API_VERSION must look like "v25.0" (got "${facebookApiVersion}")`);
  }

  return {
    appName: process.env.APP_NAME ?? "Linkar",
    appUrl,
    supportEmail: process.env.SUPPORT_EMAIL ?? "support@linkar.in",
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
    facebookAppId: process.env.FACEBOOK_APP_ID || undefined,
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET || undefined,
    // Default to the Meta key when no dedicated key is configured. This keeps
    // the secret footprint small and lets a single workspace run both channels
    // without a second key rotation. Operators who want a dedicated FB key can
    // set FACEBOOK_TOKEN_ENCRYPTION_KEY explicitly to a 64-hex-char string.
    facebookTokenEncryptionKey: optionalHexEncryptionKey(
      process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY,
      "FACEBOOK_TOKEN_ENCRYPTION_KEY",
    ) ?? (process.env.META_TOKEN_ENCRYPTION_KEY || undefined),
    facebookRedirectUri,
    facebookVerifyToken: process.env.FACEBOOK_VERIFY_TOKEN ?? process.env.META_VERIFY_TOKEN ?? "change-me",
    facebookApiVersion,
    facebookScopes: (process.env.FACEBOOK_SCOPES ??
      "pages_show_list,pages_manage_engagement,pages_manage_metadata,pages_read_engagement")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    followGatedCampaignsEnabled: booleanEnv(process.env.FOLLOW_GATED_CAMPAIGNS_ENABLED),
    authSessionSecret:
      process.env.AUTH_SESSION_SECRET?.trim()
      ?? "dev-insecure-session-secret-change-me-32ch",
    trustedProxyHops: integerEnv("TRUSTED_PROXY_HOPS", process.env.TRUSTED_PROXY_HOPS, 0),
    workerConcurrency: integerEnv("WORKER_CONCURRENCY", process.env.WORKER_CONCURRENCY, 5),
    dispatchLeaseMs: integerEnv("DISPATCH_LEASE_MS", process.env.DISPATCH_LEASE_MS, 30_000),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}
