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

/**
 * A refused Page connect (POST /api/facebook/oauth/select). `status` lets the
 * flow drop a picker that can no longer work (409, 410); `message` is
 * already a sentence for the screen.
 */
export class SelectFacebookPageError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SelectFacebookPageError";
    this.status = status;
    this.code = code;
  }
}

const API_CODE = /^[a-z0-9_]+$/;

/** A sentence the server wrote, as opposed to a code or technical detail. */
function readableServerMessage(error: string | undefined): string | undefined {
  const text = error?.trim();
  if (!text || API_CODE.test(text) || /webhook|subscription/i.test(text)) return undefined;
  return text;
}

function selectFacebookPageMessage(status: number, error: string | undefined, code: string | undefined): string {
  if (status === 401) return "Your session has ended. Sign in again, then connect Facebook.";
  if (status === 410) return "Choosing a Page took too long. Connect Facebook again to pick one.";
  if (code === "already-connected") return "That Page is already connected to another Linkar workspace.";
  if (code === "limit_reached") return "Your plan has no room for another Facebook Page.";
  if (code === "entitlement_required") return "Your plan does not include Facebook Pages. Change plans in Billing.";
  if (status === 403) return readableServerMessage(error) ?? "Only the owner or an admin can connect a Page.";
  if (status === 502) return readableServerMessage(error) ?? "Meta is temporarily unavailable. Try again in a moment.";
  return readableServerMessage(error) ?? "Could not connect that Page. Try again in a moment.";
}

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
      if (response.ok) return;
      // An edge error page is HTML, not JSON: it still gets a sentence.
      const payload = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
      const error = typeof payload.error === "string" ? payload.error : undefined;
      // The route sends a code beside a sentence, or a bare code (limit_reached, forbidden).
      const code = typeof payload.code === "string" ? payload.code : error && API_CODE.test(error) ? error : undefined;
      throw new SelectFacebookPageError(selectFacebookPageMessage(response.status, error, code), response.status, code);
    },
    connectHref: {
      instagram: "/api/meta/oauth/start?return=onboarding",
      facebook: "/api/facebook/oauth/start?return=onboarding",
    },
    navigate,
  };
}
