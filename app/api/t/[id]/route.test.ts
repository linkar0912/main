import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import type { FlowDefinitionV2 } from "@/src/lib/automation/types";

const mocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
}));

let repository = createMemoryRepository();
mocks.getRepository.mockImplementation(() => repository);

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: mocks.getRepository,
}));

const { GET } = await import("./route");

const baseDefinitionV2 = {
  version: 2,
  trigger: { type: "comment", source: "specific_media", mediaIds: ["media_1"], mediaSnapshots: [], match: "any", keywords: [] },
  publicReplies: [],
  openingMessage: { text: "Hi", optInButtonLabel: "Go" },
  followGate: { required: false, notFollowingMessage: "Follow", recheckButtonLabel: "Recheck" },
  delivery: { text: "Here", url: "https://example.com/guide" },
} satisfies FlowDefinitionV2;

async function seedLinkSentParticipant(workspaceId: string, igUserId: string) {
  const connection = await repository.upsertConnection({
    workspaceId,
    igUserId,
    username: "creator",
    accessTokenEncrypted: "sealed-token",
    status: "CONNECTED",
  });
  const automation = await repository.createAutomation(workspaceId, {
    name: "Campaign",
    definition: baseDefinitionV2,
    instagramAccountId: connection.igUserId,
  });
  const { record: participant } = await repository.createParticipant({
    workspaceId,
    automationId: automation.id,
    instagramAccountId: connection.igUserId,
    sourceCommentId: "comment_1",
    sourceMediaId: "media_1",
    sourceMediaSnapshot: { id: "media_1", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://example.com/reel", timestamp: "2026-08-21T09:00:00.000Z" },
    state: "LINK_SENT",
  });
  return { connection, automation, participant };
}

describe("GET /api/t/[id]", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getRepository.mockImplementation(() => repository);
  });

  it("302s to the delivery URL when the participant is in LINK_SENT", async () => {
    const { participant, automation } = await seedLinkSentParticipant("ws_1", "ig_123");
    expect(automation.definition.version).toBe(2);
    const response = await GET(new Request("http://localhost/api/t/" + participant.id), {
      params: Promise.resolve({ id: participant.id }),
    });
    expect(response.status).toBe(302);
    // V2 definitions always carry delivery.url; narrow the type to assert it.
    expect(response.headers.get("location")).toBe((automation.definition as FlowDefinitionV2).delivery.url);
  });

  it("404s when the participant state is not LINK_SENT", async () => {
    const { participant } = await seedLinkSentParticipant("ws_1", "ig_123");
    // Move the participant to a non-LINK_SENT state.
    await repository.transitionParticipant(participant.id, ["LINK_SENT"], { state: "FAILED" });
    const response = await GET(new Request("http://localhost/api/t/" + participant.id), {
      params: Promise.resolve({ id: participant.id }),
    });
    expect(response.status).toBe(404);
  });

  it("404s when the participant id is unknown", async () => {
    const response = await GET(new Request("http://localhost/api/t/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("404s when the delivery URL is not publicly routable", async () => {
    const { participant, automation: created } = await seedLinkSentParticipant("ws_1", "ig_123");
    // Mutate the definition to use a non-routable URL.
    const automation = await repository.getAutomation("ws_1", created.id);
    expect(automation).not.toBeNull();
    const nextDefinition: FlowDefinitionV2 = {
      ...(automation!.definition as FlowDefinitionV2),
      delivery: { ...(automation!.definition as FlowDefinitionV2).delivery, url: "javascript:alert(1)" },
    };
    await repository.updateAutomation("ws_1", created.id, { definition: nextDefinition });
    const response = await GET(new Request("http://localhost/api/t/" + participant.id), {
      params: Promise.resolve({ id: participant.id }),
    });
    expect(response.status).toBe(404);
  });
});
