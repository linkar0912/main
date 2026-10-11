"use client";

import { useMemo, useRef } from "react";
import { OnboardingFlow } from "@/src/components/onboarding/onboarding-flow";
import type { OnboardingClient } from "@/src/components/onboarding/onboarding-client";
import { buildOnboardingPlan } from "@/src/lib/onboarding/build-plan";
import { readStoredAnswers } from "@/src/lib/onboarding/answers";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import { PREVIEW_MEDIA, previewView, type PreviewVariant } from "./fixtures";

/**
 * The real onboarding flow on fixtures: saves stay in memory, the plan is
 * computed in the browser with the same buildOnboardingPlan the API uses, and
 * leaving goes to the Home preview instead of the app.
 */
export function OnboardingPreview({ variant, step }: { variant: PreviewVariant; step: number }) {
  const view = useMemo(() => previewView(variant, step), [variant, step]);
  const state = useRef<OnboardingView>(view);

  const client = useMemo<OnboardingClient>(() => ({
    async save(body) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      const current = state.current;
      const next: OnboardingView = {
        ...current,
        ...(body.step ? { step: body.step } : {}),
        answers: current.flow === "owner" && body.answers ? readStoredAnswers({ ...current.answers, ...body.answers }) : current.answers,
        completedAt: body.action === "complete" ? new Date().toISOString() : current.completedAt,
        skippedAt: body.action === "skip" ? new Date().toISOString() : current.skippedAt,
      };
      state.current = next;
      return next;
    },
    async loadPlan() {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      return buildOnboardingPlan({
        answers: state.current.answers,
        currentPlan: "free",
        instagram: variant === "connected" ? { username: "studio.priya", media: PREVIEW_MEDIA } : null,
      });
    },
    async listFacebookPages() {
      return [{ id: "page_1", name: "Studio Priya" }, { id: "page_2", name: "Priya Weddings" }];
    },
    async selectFacebookPage() {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    },
    connectHref: { instagram: "?step=8&variant=connected", facebook: "?step=7&variant=not-connected" },
    navigate(href) {
      window.location.assign(href.startsWith("/dashboard") ? "/dev-preview/workspace/dashboard?state=plan" : `/dev-preview/workspace${href.split("?")[0]}`);
    },
  }), [variant]);

  return <OnboardingFlow view={view} client={client} initialStep={step} />;
}
