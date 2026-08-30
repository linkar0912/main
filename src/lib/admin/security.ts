import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export type AdminSecurityFactor = {
  id: string;
  friendlyName: string;
  factorType: string;
  status: "verified" | "unverified";
  updatedAt?: string;
};

export type AdminSecurityState = {
  aal: "aal1" | "aal2";
  nextAal: "aal1" | "aal2";
  factors: Array<Omit<AdminSecurityFactor, "updatedAt">>;
};

export class AdminSecurityProviderError extends Error {
  readonly status = 502;
  readonly code = "mfa_provider_error";

  constructor() {
    super("mfa_provider_error");
    this.name = "AdminSecurityProviderError";
  }
}

export function safeSecurityFactors(data: { all?: Array<Record<string, unknown>> } | null): AdminSecurityFactor[] {
  return (data?.all ?? []).map((factor) => ({
    id: typeof factor.id === "string" ? factor.id : "",
    friendlyName: typeof factor.friendly_name === "string" ? factor.friendly_name : "Authenticator",
    factorType: typeof factor.factor_type === "string" ? factor.factor_type : "totp",
    status: factor.status === "verified" ? "verified" as const : "unverified" as const,
    ...(typeof factor.updated_at === "string" ? { updatedAt: factor.updated_at } : {}),
  })).filter((factor) => factor.id.length > 0);
}

export async function loadAdminSecurityFactors() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) throw new AdminSecurityProviderError();
  return { supabase, factors: safeSecurityFactors(data) };
}

export async function loadAdminSecurityState(ownerAal: "aal1" | "aal2"): Promise<AdminSecurityState> {
  const supabase = await createSupabaseServerClient();
  const [factorResult, aalResult] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factorResult.error || !factorResult.data || aalResult.error || !aalResult.data) {
    throw new AdminSecurityProviderError();
  }

  return {
    aal: aalResult.data.currentLevel === "aal2" ? "aal2" : ownerAal,
    nextAal: aalResult.data.nextLevel === "aal2" ? "aal2" : "aal1",
    factors: safeSecurityFactors(factorResult.data).map(({ updatedAt: _updatedAt, ...factor }) => factor),
  };
}
