import type { OnboardingPlan } from "@/src/lib/onboarding/build-plan";
import type { OnboardingAction, OnboardingView } from "@/src/lib/onboarding/view";

export type OnboardingSave = {
  step?: number;
  answers?: Record<string, unknown>;
  action?: OnboardingAction;
};

export type FacebookPageChoice = { id: string; name: string };

/**
 * Everything the flow does over the network, behind one seam so the dev
 * preview can run the real component on fixtures (app/dev-preview/onboarding).
 */
export type OnboardingClient = {
  save(body: OnboardingSave): Promise<OnboardingView>;
  loadPlan(): Promise<OnboardingPlan>;
  listFacebookPages(): Promise<FacebookPageChoice[]>;
  selectFacebookPage(pageId: string): Promise<void>;
  /** Where the connect buttons go; they come back to /onboarding (oauth-return.ts). */
  connectHref: { instagram: string; facebook: string };
  /** Leaves onboarding for an app page (Home, the builder, Billing). */
  navigate(href: string): void;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error ?? fallback);
  return payload.data;
}

export function createOnboardingClient(navigate: (href: string) => void): OnboardingClient {
  return {
    async save(body) {
      const response = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return readJson<OnboardingView>(response, "Could not save your answers");
    },
    async loadPlan() {
      return readJson<OnboardingPlan>(await fetch("/api/onboarding/plan"), "Could not build your plan");
    },
    async listFacebookPages() {
      return readJson<FacebookPageChoice[]>(await fetch("/api/facebook/oauth/pages"), "Could not load your Facebook Pages");
    },
    async selectFacebookPage(pageId) {
      const response = await fetch("/api/facebook/oauth/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      if (!response.ok) throw new Error("Could not connect that Page");
    },
    connectHref: {
      instagram: "/api/meta/oauth/start?return=onboarding",
      facebook: "/api/facebook/oauth/start?return=onboarding",
    },
    navigate,
  };
}
