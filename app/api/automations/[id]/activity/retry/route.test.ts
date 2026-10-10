import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getAutomation: vi.fn(),
  getParticipantById: vi.fn(),
  transitionParticipant: vi.fn(),
  enqueueWebhookEvents: vi.fn(),
  processNormalizedEvent: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    getAutomation: mocks.getAutomation,
    getParticipantById: mocks.getParticipantById,
    transitionParticipant: mocks.transitionParticipant,
  }),
}));
vi.mock("@/src/lib/queue", () => ({ enqueueWebhookEvents: mocks.enqueueWebhookEvents }));
vi.mock("@/src/lib/automation/runner", () => ({ processNormalizedEvent: mocks.processNormalizedEvent }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ metaApiVersion: "v25.0" }) }));

const { POST } = await import("./route");

const failedParticipant = {
  id: "participant_1",
  workspaceId: "workspace_1",
  automationId: "automation_1",
  instagramAccountId: "ig_1",
  state: "FAILED",
  sourceCommentId: "comment_1",
  sourceMediaId: "media_1",
  matchedKeyword: "guide",
};

function retry() {
  return POST(new Request("http://localhost/api/automations/automation_1/activity/retry", {
    method: "POST",
    body: JSON.stringify({ participantId: "participant_1" }),
  }), { params: Promise.resolve({ id: "automation_1" }) });
}

describe("POST /api/automations/[id]/activity/retry", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getAutomation.mockReset().mockResolvedValue({ id: "automation_1", status: "ACTIVE" });
    mocks.getParticipantById.mockReset().mockResolvedValue(failedParticipant);
    mocks.transitionParticipant.mockReset().mockResolvedValue({ ...failedParticipant, state: "COMMENT_MATCHED" });
    mocks.enqueueWebhookEvents.mockReset().mockResolvedValue(1);
    mocks.processNormalizedEvent.mockReset();
  });

  it("re-arms a failed participant and replays it", async () => {
    const response = await retry();
    expect(response.status).toBe(200);
    expect(mocks.enqueueWebhookEvents).toHaveBeenCalledTimes(1);
  });

  it("returns 409 without replaying when a concurrent retry already moved the participant", async () => {
    mocks.transitionParticipant.mockResolvedValue(null);

    const response = await retry();

    expect(response.status).toBe(409);
    expect(mocks.enqueueWebhookEvents).not.toHaveBeenCalled();
    expect(mocks.processNormalizedEvent).not.toHaveBeenCalled();
  });
});
