import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ authSessionSecret: "test-only" }) }));
import { createAdminIntegrationsRepository, integrationExpiryWhere } from "./repository";
import { decodeAdminCursor } from "../cursor";
import type { prisma } from "@/src/lib/prisma";
const now = new Date("2026-10-02T00:00:00Z");
it("filters expiry in the database before the bounded result limit", async () => {
  const instagram = vi.fn().mockResolvedValue([]); const facebook = vi.fn().mockResolvedValue([]);
  const repo = createAdminIntegrationsRepository({ instagramConnection: { findMany: instagram }, facebookPageConnection: { findMany: facebook } } as unknown as typeof prisma, () => now);
  await repo.listPage({ expiry: "expired", text: "account" });
  for (const find of [instagram, facebook]) {
    expect(find.mock.calls[0][0].where.tokenExpiresAt).toEqual({ lte: now });
    expect(find.mock.calls[0][0].take).toBe(101);
  }
  expect(integrationExpiryWhere("within_7_days", now)).toEqual({ tokenExpiresAt: { gt: new Date("2026-10-03"), lte: new Date("2026-10-09") } });
});
it("paginates combined providers with a signed cursor and preserves text search", async () => {
  const row = (id: string) => ({ id, igUserId: id, username: id, pageId: id, pageName: id, status: "CONNECTED", tokenExpiresAt: null, connectedAt: now, version: 1, workspace: { id: "w", name: "Acme" } });
  const instagram = vi.fn().mockResolvedValue(Array.from({ length: 60 }, (_, i) => row(`a${String(i).padStart(3, "0")}`)));
  const facebook = vi.fn().mockResolvedValue(Array.from({ length: 60 }, (_, i) => row(`b${String(i).padStart(3, "0")}`)));
  const repo = createAdminIntegrationsRepository({ instagramConnection: { findMany: instagram }, facebookPageConnection: { findMany: facebook } } as unknown as typeof prisma, () => now);
  const page = await repo.listPage({});
  expect(page.items).toHaveLength(100);
  expect(decodeAdminCursor(page.nextCursor!, "test-only")).toEqual({ id: "b039", createdAt: now.toISOString() });
  await repo.listPage({ cursor: page.nextCursor!, text: "Acme" });
  expect(instagram.mock.calls[1][0].where.AND[0].OR[1]).toEqual({ connectedAt: now, id: { gt: "b039" } });
  expect(instagram.mock.calls[1][0].where.OR[0]).toHaveProperty("username");
});
