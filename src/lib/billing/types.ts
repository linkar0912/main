export type BillingInterval = "MONTHLY" | "ANNUAL";

export type BillingPlanKey = "creator" | "growth" | "agency";

export type BillingCatalogPlan = {
  key: BillingPlanKey;
  name: string;
  monthlyPaise: number;
  annualPaise: number;
  memberLimit: number;
  automationLimit: number;
  instagramConnectionLimit: number;
  facebookConnectionLimit: number;
  sequenceLimit: number;
  monthlyBroadcastLimit: number;
  monthlyDeliveryLimit: number;
  features: readonly string[];
};
