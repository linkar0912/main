import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

describe("tracked link repository", () => {
  it("creates, fetches, and lists a tracked link with UTM params", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_l", "owner@team.com");
    const link = await repository.createTrackedLink("workspace_l", {
      slug: "summer-sale",
      destination: "https://example.com/sale",
      utmSource: "instagram",
      utmCampaign: "summer",
    });
    expect(link.slug).toBe("summer-sale");
    expect(link.utmSource).toBe("instagram");
    const fetched = await repository.getTrackedLinkBySlug("workspace_l", "summer-sale");
    expect(fetched?.id).toBe(link.id);
    const list = await repository.listTrackedLinks("workspace_l", 10);
    expect(list).toHaveLength(1);
  });

  it("rejects duplicate slugs in the same workspace", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_l", "owner@team.com");
    await repository.createTrackedLink("workspace_l", { slug: "dup", destination: "https://example.com/a" });
    await expect(
      repository.createTrackedLink("workspace_l", { slug: "dup", destination: "https://example.com/b" }),
    ).rejects.toThrow(/already used/);
  });

  it("isolates links across workspaces (same slug is fine in another workspace)", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_x", "owner@team.com");
    await repository.ensureWorkspace("workspace_y", "owner@team.com");
    await repository.createTrackedLink("workspace_x", { slug: "shared", destination: "https://example.com/x" });
    const yLink = await repository.createTrackedLink("workspace_y", { slug: "shared", destination: "https://example.com/y" });
    expect(yLink.destination).toBe("https://example.com/y");
  });

  it("records clicks and rolls them up into stats with unique counts", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_l", "owner@team.com");
    const link = await repository.createTrackedLink("workspace_l", {
      slug: "trial",
      destination: "https://example.com/trial",
    });
    await repository.recordTrackedLinkClick(link.id, { workspaceId: "workspace_l", ipHash: "ip_a", country: "US" });
    await repository.recordTrackedLinkClick(link.id, { workspaceId: "workspace_l", ipHash: "ip_a", country: "US" });
    await repository.recordTrackedLinkClick(link.id, { workspaceId: "workspace_l", ipHash: "ip_b", country: "IN" });
    const stats = await repository.getTrackedLinkStats("workspace_l", link.id);
    expect(stats).not.toBeNull();
    expect(stats!.totalClicks).toBe(3);
    expect(stats!.uniqueClicks).toBe(2);
    expect(stats!.lastClickedAt).toBeDefined();
    expect(stats!.topCountries.length).toBeGreaterThan(0);
  });

  it("resolves a public slug without a workspace boundary", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_p", "owner@team.com");
    const link = await repository.createTrackedLink("workspace_p", { slug: "any", destination: "https://example.com/any" });
    const publicLookup = await repository.getTrackedLinkBySlugPublic("any");
    expect(publicLookup?.id).toBe(link.id);
  });

  it("deletes a link and clears its clicks", async () => {
    const repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_l", "owner@team.com");
    const link = await repository.createTrackedLink("workspace_l", { slug: "throw", destination: "https://example.com/t" });
    await repository.recordTrackedLinkClick(link.id, { workspaceId: "workspace_l", ipHash: "x" });
    const removed = await repository.deleteTrackedLink("workspace_l", link.id);
    expect(removed).toBe(true);
    expect(await repository.getTrackedLinkBySlug("workspace_l", "throw")).toBeNull();
    const stats = await repository.getTrackedLinkStats("workspace_l", link.id);
    expect(stats).toBeNull();
  });
});
