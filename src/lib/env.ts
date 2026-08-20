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
};

export function getServerEnv(): ServerEnv {
  return {
    appName: process.env.APP_NAME ?? "DMSetu",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    supportEmail: process.env.SUPPORT_EMAIL ?? "hello@example.com",
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    metaAppId: process.env.META_APP_ID || undefined,
    metaAppSecret: process.env.META_APP_SECRET || undefined,
    metaTokenEncryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY || undefined,
    metaRedirectUri:
      process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/meta/oauth/callback",
    metaVerifyToken: process.env.META_VERIFY_TOKEN ?? "change-me",
    metaApiVersion: process.env.META_API_VERSION ?? "v25.0",
    metaScopes: (process.env.META_SCOPES ??
      "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}
