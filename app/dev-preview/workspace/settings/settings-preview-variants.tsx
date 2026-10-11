"use client";

import type { ReactNode } from "react";

/**
 * Dev-only review states for Settings, layered over the workspace fixtures:
 *   ?variant=attention  an account that needs a reconnect, a Page Meta could
 *                       not check, deliveries near the limit, every seat used
 *   ?variant=long       very long handles, Page names and emails
 * Anything not listed here falls through to the shared fixture shim.
 */
const INSTALLED = Symbol.for("linkar.devPreview.settingsVariants");
type VariantWindow = Window & { [INSTALLED]?: boolean };

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

function variantBody(variant: string, path: string, body: unknown): unknown {
  const data = (body as { data?: unknown })?.data;
  if (variant === "attention") {
    if (path === "/api/meta/connection") {
      return { data: [
        ...(data as unknown[]),
        { id: "conn_ig_drops", igUserId: "17841400000000001", username: "kavya.drops", status: "EXPIRED", connectedAt: ago(220 * DAY), profilePictureUrl: null },
      ] };
    }
    if (path === "/api/meta/connection/health") {
      return { data: [
        { id: "conn_ig_kavya", username: "studio.kavya", status: "CONNECTED", requiredFields: ["comments", "messages", "messaging_postbacks"], subscribedFields: ["comments"], missingFields: ["messages", "messaging_postbacks"] },
      ] };
    }
    if (path === "/api/facebook/connection/health") {
      return { data: (data as Array<Record<string, unknown>>).map((entry) => ({ ...entry, checkError: "Meta did not answer in time", missingFields: [] })) };
    }
    if (path === "/api/billing") return { data: { ...(data as object), deliveriesUsed: 23_910 } };
    if (path === "/api/team/invitations") {
      const team = body as { members: unknown[]; invitations: unknown[] };
      return { ...team, invitations: [...team.invitations, { id: "inv_meera", email: "meera@studiokavya.in", role: "ADMIN", expiresAt: ahead(1 * DAY) }] };
    }
  }
  if (variant === "long") {
    if (path === "/api/meta/connection") {
      return { data: (data as Array<Record<string, unknown>>).map((entry) => ({ ...entry, username: "studio.kavya.handloom.and.festive.couture.official" })) };
    }
    if (path === "/api/facebook/connection") {
      return { data: (data as Array<Record<string, unknown>>).map((entry) => ({ ...entry, pageName: "Studio Kavya Handloom Sarees, Lehengas & Festive Couture (Official Page)" })) };
    }
    if (path === "/api/team/invitations") {
      const team = body as { members: unknown[]; invitations: unknown[] };
      return { ...team, invitations: [{ id: "inv_long", email: "operations.and.partnerships.team.lead@studiokavyahandloom.co.in", role: "MEMBER", expiresAt: ahead(6 * DAY) }] };
    }
  }
  return body;
}

function install(): void {
  if (typeof window === "undefined") return;
  const target = window as VariantWindow;
  if (target[INSTALLED]) return;
  target[INSTALLED] = true;
  const below = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await below(input, init);
    const variant = new URLSearchParams(window.location.search).get("variant") ?? "";
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (!variant || method.toUpperCase() !== "GET") return response;
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(href, window.location.origin).pathname;
    const body = await response.clone().json().catch(() => undefined);
    if (body === undefined) return response;
    const next = variantBody(variant, path, body);
    if (next === body) return response;
    return new Response(JSON.stringify(next), { status: response.status, headers: { "content-type": "application/json" } });
  };
}

/** Installs after the shared fixture shim (which the layout renders first). */
export function SettingsPreviewVariants({ children }: { children: ReactNode }) {
  install();
  return <>{children}</>;
}
