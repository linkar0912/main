"use client";

import type { ReactNode } from "react";

// Development-only: answers the owner console's client-side API calls (detail
// drawers, enrolment, deletion previews, commands) with fixtures, so every
// drawer and dialog can be opened and submitted without a database.
// ?state=error makes every command fail the way a stale record does.

const MOCK_DELAY_MS = 250;
const ORIGINAL_FETCH = Symbol.for("linkar.devPreview.adminOriginalFetch");
type PreviewWindow = Window & { [ORIGINAL_FETCH]?: typeof fetch };

const MINUTE = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();
const ahead = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString();

const QR = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29' shape-rendering='crispEdges'><rect width='29' height='29' fill='#fff'/><path d='M1 1h7v7H1zM21 1h7v7h-7zM1 21h7v7H1z' fill='none' stroke='#000'/><path d='M3 3h3v3H3zM23 3h3v3h-3zM3 23h3v3H3zM10 2h2v2h-2zM13 4h2v2h-2zM10 10h3v2h-3zM15 9h2v4h-2zM19 11h3v2h-3zM11 15h4v2h-4zM18 16h2v3h-2zM22 18h4v2h-4zM12 20h2v4h-2zM16 22h3v2h-3zM23 23h3v3h-3zM9 13h1v5H9zM24 12h2v2h-2z'/></svg>";

const integrationDetails: Record<string, object> = {
  ig_conn_1: { subscribedFields: ["comments", "messages", "mentions"], missingFields: [], checkedAt: ago(14) },
  ig_conn_2: { subscribedFields: [], missingFields: ["comments", "messages"], checkedAt: ago(60 * 26), safeErrorCode: "TOKEN_EXPIRED" },
  fb_conn_1: { subscribedFields: ["feed"], missingFields: ["messages"], checkedAt: ago(40) },
  ig_conn_3: { subscribedFields: ["comments", "messages"], missingFields: [], checkedAt: ago(90) },
};

const operationActions: Record<string, string[]> = {
  automation: ["pause", "archive", "restore_version"],
  sequence: ["pause", "archive"],
  broadcast: ["cancel_pending"],
  contact: ["suppress", "export_one"],
  tracked_link: ["update_destination", "disable"],
  delivery: ["retry", "release_stale_claim"],
  webhook: ["reprocess"],
};

type Answer = { status: number; body: unknown } | null;

function scenario(): string | null {
  return new URLSearchParams(window.location.search).get("state");
}

function answer(method: string, url: URL, body: unknown): Answer {
  const path = url.pathname;
  const write = method !== "GET";
  if (write && scenario() === "error") return { status: 409, body: { error: "stale_version" } };

  let match = /^\/api\/admin\/integrations\/(instagram|facebook)\/([^/]+)$/.exec(path);
  if (match && !write) {
    const id = match[2];
    const base = {
      id, provider: match[1], workspace: { id: "workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c", name: "Acme Studio" },
      accountId: "17841400008460056", accountName: id === "fb_conn_1" ? "Chai Point Studio" : id === "ig_conn_2" ? "@acme.shop" : "@acmestudio",
      status: id === "ig_conn_2" ? "EXPIRED" : "CONNECTED", version: 4, tokenExpiry: "later", tokenExpiresAt: ahead(60 * 24 * 48), connectedAt: ago(60 * 24 * 100),
      subscriptionHealth: id === "fb_conn_1" ? "drifted" : "healthy",
      allowedActions: id === "ig_conn_2" ? ["disconnect"] : id === "fb_conn_1" ? ["refresh_token", "repair_subscription", "disconnect"] : ["refresh_token", "disconnect"],
    };
    return { status: 200, body: { data: { ...base, ...(integrationDetails[id] ?? integrationDetails.ig_conn_1) } } };
  }
  if (match && write) {
    const action = (body as { action?: string } | null)?.action;
    if (action === "prepare_disconnect") return { status: 200, body: { data: { token: "challenge", confirmationPhrase: "DISCONNECT acmestudio" } } };
    return { status: 200, body: { data: {} } };
  }

  match = /^\/api\/admin\/operations\/([a-z_]+)\/([^/]+)$/.exec(path);
  if (match && !write) {
    const kind = match[1];
    return {
      status: 200,
      body: {
        data: {
          id: match[2], kind, workspace: { id: "workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c", name: "Acme Studio" },
          title: "Diwali giveaway replies", status: "ACTIVE", provider: "instagram", version: 14, createdAt: ago(60 * 24 * 20), updatedAt: ago(42),
          attributes: { triggerKind: "COMMENT_KEYWORD", keywords: "GIVEAWAY, DIWALI", repliesSent: 1284, followGate: true, lastFailure: null },
          allowedActions: operationActions[kind] ?? [],
        },
      },
    };
  }

  match = /^\/api\/admin\/system\/queues\/([a-z_-]+)$/.exec(path);
  if (match && !write) {
    return {
      status: 200,
      body: {
        data: [
          { id: "j_8812", name: "instagram-event", failedAt: ago(4), attemptsMade: 3, code: "PROVIDER_REJECTED" },
          { id: "j_8809", name: "instagram-event", failedAt: ago(9), attemptsMade: 3, code: "PROVIDER_REJECTED" },
          { id: "j_8790", name: "broadcast-send", failedAt: ago(48), attemptsMade: 1, code: null },
        ],
      },
    };
  }

  if (path === "/api/admin/security") {
    if (!write) return { status: 200, body: { data: { aal: "aal2", nextAal: "aal2", factors: [{ id: "f1", friendlyName: "Pixel 9", factorType: "totp", status: "verified" }, { id: "f2", friendlyName: "iPad backup", factorType: "totp", status: "verified" }] } } };
    const action = (body as { action?: string } | null)?.action;
    if (action === "enroll") return { status: 200, body: { data: { factorId: "f3", friendlyName: "Linkar owner 3", qrCode: QR, secret: "JBSWY3DPEHPK3PXP4G2LQ7MZ", uri: "otpauth://totp/Linkar" } } };
    if (action === "prepare_unenroll") return { status: 200, body: { data: { token: "challenge", confirmationPhrase: "REMOVE iPad backup" } } };
    return { status: 200, body: { data: { redirectTo: "/dev-preview/admin" } } };
  }

  if (path === "/api/admin/deletions/preview") {
    return {
      status: 200,
      body: {
        data: {
          impact: { identity: { label: "Ember Fitness (ember-fitness)" }, counts: { members: 3, automations: 11, contacts: 18432, deliveries: 92114, instagramConnections: 1, facebookConnections: 1 }, warnings: ["This workspace has an active paid subscription. Cancel it in Razorpay first or the customer keeps being charged."] },
          impactDigest: "digest", confirmationPhrase: "DELETE ember-fitness", challenge: { token: "challenge", expiresAt: ahead(10) },
        },
      },
    };
  }
  if (path === "/api/admin/deletions/synthetic/preview") {
    return { status: 200, body: { data: { count: 14, membershipsAffected: 16, ownedWorkspacesAffected: 9, protectedAccountsExcluded: 1, digest: "digest", confirmationPhrase: "DELETE 14 TEST ACCOUNTS", challenge: { token: "challenge", expiresAt: ahead(10) } } } };
  }
  if (path === "/api/admin/invite-codes" && write) {
    return { status: 201, body: { data: { code: "LINKAR-7QX2-M9KD-4TPA", plan: { key: "growth", name: "Growth" } } } };
  }
  if (path === "/api/admin/workspaces/workspace_9f30c8c8-a723-4c1e-b0d4-1e2f3a4b633c/automations/pause") return { status: 200, body: { data: { paused: 12 } } };
  if (path.endsWith("/automations/resume")) return { status: 200, body: { data: { resumed: 11, skipped: 1 } } };
  if (path.endsWith("/export") || path === "/api/admin/audit/export") return { status: 200, body: "id,name\n1,Acme Studio\n" };
  if (write) return { status: 200, body: { data: {} } };
  return null;
}

function install(): void {
  if (typeof window === "undefined") return;
  const target = window as PreviewWindow;
  if (target[ORIGINAL_FETCH]) return;
  const original = window.fetch.bind(window);
  target[ORIGINAL_FETCH] = original;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/admin/")) return original(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    try { body = typeof init?.body === "string" ? JSON.parse(init.body) : null; } catch { body = null; }
    await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS));
    const result = answer(method, url, body);
    if (!result) return Response.json({ error: "not_mocked" }, { status: 404 });
    if (typeof result.body === "string") return new Response(result.body, { status: result.status, headers: { "content-type": "text/csv" } });
    return Response.json(result.body, { status: result.status });
  };
}

/** Installs the fixture-backed fetch before any screen below it renders. */
export function AdminPreviewFetch({ children }: { children: ReactNode }) {
  install();
  return <>{children}</>;
}
