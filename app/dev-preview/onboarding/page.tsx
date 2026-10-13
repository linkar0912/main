import "../../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MEMBER_STEP_COUNT, OWNER_STEP_COUNT } from "@/src/lib/onboarding/answers";
import { OnboardingPreview } from "./onboarding-preview";
import type { PreviewVariant } from "./fixtures";

export const metadata: Metadata = { title: "Welcome · Linkar (preview)", robots: { index: false, follow: false } };

/**
 * Dev-only preview of first-time onboarding on fixtures:
 * /dev-preview/onboarding?step=1..9&variant=connected|not-connected|member
 * (the member flow has 3 steps). 404s outside development, here and in the proxy.
 */
export default async function OnboardingPreviewPage({ searchParams }: PageProps<"/dev-preview/onboarding">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const variant: PreviewVariant = query.variant === "connected" || query.variant === "member" ? query.variant : "not-connected";
  const max = variant === "member" ? MEMBER_STEP_COUNT : OWNER_STEP_COUNT;
  const requested = Number(typeof query.step === "string" ? query.step : 1);
  const step = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), max) : 1;
  return <OnboardingPreview key={`${variant}:${step}`} variant={variant} step={step} />;
}
