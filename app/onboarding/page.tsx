import "../globals.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OnboardingScreen } from "@/src/components/onboarding/onboarding-screen";
import { PLAN_INTENT_COOKIE, readPlanIntent } from "@/src/lib/billing/plan-intent";

export const metadata: Metadata = {
  title: "Welcome · Linkar",
  robots: { index: false, follow: false },
};

/** Status words the connect flows put on the return URL (?meta= / ?facebook=). */
function statusParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && /^[a-z-]{1,40}$/.test(value) ? value : undefined;
}

// First-time onboarding lives outside the app shell (its own full-screen
// layout). The proxy gates it like every signed-in page; /api/onboarding is
// the source of truth for where the person left off.
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const query = await searchParams;
  // A paid plan picked on /pricing: the owner's way out of onboarding goes to
  // its checkout in Billing instead of Home.
  const planIntent = readPlanIntent((await cookies()).get(PLAN_INTENT_COOKIE)?.value);
  return <OnboardingScreen connectReturn={{ meta: statusParam(query.meta), facebook: statusParam(query.facebook) }} planIntent={planIntent} />;
}
