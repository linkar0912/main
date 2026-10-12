import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test as base, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { sealSecret } from "../src/lib/security/secrets";
import { assertLocalE2ETarget, E2E_USERS_DIR, e2eServerMode, serverEnvValue, type E2ERun } from "./local-target";

/**
 * Workspaces of their own for specs that need server-rendered data.
 *
 * Most specs share the owner auth.setup.ts signs up and mock the API in the
 * browser. Pages that render from the database on the server (the automation
 * list, an automation's own pages, Home) cannot be fed that way, and the
 * shared workspace runs specs in parallel and is capped at the free plan's
 * automation limit. A spec that needs real rows takes the `owner` fixture: a
 * fresh confirmed account in a fresh workspace, signed in through the real
 * /api/auth/login, with any connected accounts it needs seeded in the local
 * database. auth.teardown.ts removes every owner recorded here.
 */

export const E2E_PASSWORD = "linkar-e2e-password";

export function supabaseAdmin() {
  const mode = e2eServerMode();
  const url = serverEnvValue("SUPABASE_URL", mode) ?? serverEnvValue("NEXT_PUBLIC_SUPABASE_URL", mode);
  const serviceRoleKey = serverEnvValue("SUPABASE_SERVICE_ROLE_KEY", mode);
  if (!url || !serviceRoleKey) {
    throw new Error("e2e needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    url,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  };
}

let prisma: PrismaClient | undefined;

/** The local database the server under test uses; only an exported DATABASE_URL is used. */
export function e2eDatabase(): PrismaClient {
  assertLocalE2ETarget();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("e2e data fixtures need DATABASE_URL exported (CI exports the local Supabase database)");
  prisma ??= new PrismaClient({ datasourceUrl: databaseUrl });
  return prisma;
}

/**
 * A confirmed account created through the Supabase Admin API (no email is
 * sent, so the local Auth email rate limit is untouched), recorded for the
 * teardown before anything else can fail.
 */
export async function createConfirmedUser(prefix = "owner"): Promise<E2ERun> {
  assertLocalE2ETarget();
  const email = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const { url, headers } = supabaseAdmin();
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: E2E_PASSWORD, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`e2e: could not create ${email} (${response.status} ${await response.text()})`);
  const { id } = (await response.json()) as { id: string };
  mkdirSync(E2E_USERS_DIR, { recursive: true });
  writeFileSync(join(E2E_USERS_DIR, `${id}.json`), JSON.stringify({ email, userId: id } satisfies E2ERun));
  return { email, userId: id };
}

/** Signs in through the real login endpoint; the first verified sign-in provisions the workspace. */
export async function signIn(request: APIRequestContext, email: string, password = E2E_PASSWORD): Promise<void> {
  const response = await request.post("/api/auth/login", { form: { email, password }, maxRedirects: 0 });
  expect(response.status(), "login answers with a redirect").toBe(303);
  const location = response.headers().location ?? "";
  expect(location, "login redirects into the app, not back to /login").not.toContain("/login");
}

/** Leaves first-time onboarding through the same call as the flow's "Skip" button. */
export async function skipOnboarding(request: APIRequestContext): Promise<void> {
  const response = await request.put("/api/onboarding", { data: { action: "skip" } });
  expect(response.ok(), "skipping onboarding succeeds").toBe(true);
}

export async function workspaceIdFor(email: string): Promise<string> {
  const member = await e2eDatabase().workspaceMember.findFirst({ where: { email }, select: { workspaceId: true } });
  if (!member) throw new Error(`e2e: ${email} has no workspace`);
  return member.workspaceId;
}

function sealedToken(): string {
  const key = serverEnvValue("META_TOKEN_ENCRYPTION_KEY", e2eServerMode());
  if (!key) throw new Error("e2e data fixtures need META_TOKEN_ENCRYPTION_KEY");
  // Never a usable token: calls to Meta with it fail and the app degrades
  // (no avatar, no media) exactly as it does for an expired connection.
  return sealSecret(`e2e-not-a-real-token-${randomUUID()}`, key);
}

export type Owner = E2ERun & {
  workspaceId: string;
  context: BrowserContext;
  page: Page;
  /** Seeds a connected Instagram professional account for this workspace. */
  connectInstagram(username?: string): Promise<{ id: string; igUserId: string; username: string }>;
  /** Seeds a connected Facebook Page for this workspace. */
  connectFacebookPage(pageName?: string): Promise<{ id: string; pageId: string; pageName: string }>;
};

export async function createOwner(browser: Browser, options: { onboarding?: "skip" | "keep" } = {}): Promise<Owner> {
  const run = await createConfirmedUser();
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await signIn(context.request, run.email);
  if (options.onboarding !== "keep") await skipOnboarding(context.request);
  const workspaceId = await workspaceIdFor(run.email);
  const page = await context.newPage();
  return {
    ...run,
    workspaceId,
    context,
    page,
    async connectInstagram(username = "e2ebrand") {
      const record = await e2eDatabase().instagramConnection.create({
        data: {
          id: `connection_${randomUUID()}`,
          workspaceId,
          igUserId: `e2e_ig_${randomUUID()}`,
          username,
          accessTokenEncrypted: sealedToken(),
        },
      });
      return { id: record.id, igUserId: record.igUserId, username: record.username };
    },
    async connectFacebookPage(pageName = "Linkar Demo Page") {
      const record = await e2eDatabase().facebookPageConnection.create({
        data: {
          id: `facebook_page_${randomUUID()}`,
          workspaceId,
          pageId: `e2e_page_${randomUUID()}`,
          pageName,
          accessTokenEncrypted: sealedToken(),
        },
      });
      return { id: record.id, pageId: record.pageId, pageName: record.pageName };
    },
  };
}

export const test = base.extend<{ owner: Owner }>({
  // Playwright's fixture callback, not a React hook.
  owner: async ({ browser }, provide) => {
    const owner = await createOwner(browser);
    await provide(owner);
    await owner.context.close();
  },
});

export { expect };
