import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationParticipantRecord } from "@/src/lib/repository";
import { computeFunnelSummary } from "./route";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getRepository: vi.fn(),
  getAutomation: vi.fn(),
  listParticipants: vi.fn(),
  countParticipantFunnel: vi.fn(),
  listAutomationExecutions: vi.fn(),
  listFacebookPages: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: mocks.getRepository,
}));

const { GET } = await import("./route");

function makeParticipant(overrides: Partial<AutomationParticipantRecord> = {}): AutomationParticipantRecord {
  return {
    id: "participant_1",
    workspaceId: "workspace_a",
    automationId: "automation_1",
    instagramAccountId: "ig_must-not-escape",
    igScopedUserId: "scoped_must-not-escape",
    sourceCommentId: "comment_must-not-escape",
    sourceMediaId: "media_1",
    sourceMediaSnapshot: {
      id: "media_1",
      caption: "Giveaway Reel",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_1/",
      timestamp: "2026-08-20T08:00:00.000Z",
    },
    matchedKeyword: "drop",
    state: "FOLLOW_REQUIRED",
    publicReplyStatus: "SENT",
    publicReplyProviderId: "provider_must-not-escape",
    publicReplySentAt: "2026-08-21T08:01:00.000Z",
    openingStatus: "SENT",
    openingProviderId: "provider_must-not-escape",
    openingSentAt: "2026-08-21T08:02:00.000Z",
    followStatus: false,
    followCheckedAt: "2026-08-21T09:00:00.000Z",
    followCheckError: "must-not-escape",
    finalDeliveryStatus: "SKIPPED",
    messagingWindowExpiresAt: "2026-08-21T10:00:00.000Z",
    recheckCount: 3,
    createdAt: "2026-08-21T08:00:00.000Z",
    updatedAt: "2026-08-21T09:00:00.000Z",
    ...overrides,
  };
}

describe("computeFunnelSummary", () => {
  it("counts commented, opening-sent, opted-in-or-further, followed, and link-delivered participants", () => {
    const summary = computeFunnelSummary([
      { state: "COMMENT_MATCHED", openingStatus: "PENDING", followStatus: undefined, finalDeliveryStatus: "PENDING" },
      { state: "OPENING_SENT", openingStatus: "SENT", followStatus: undefined, finalDeliveryStatus: "PENDING" },
      { state: "FOLLOW_REQUIRED", openingStatus: "SENT", followStatus: false, finalDeliveryStatus: "PENDING" },
      { state: "FOLLOW_VERIFIED", openingStatus: "SENT", followStatus: true, finalDeliveryStatus: "PENDING" },
      { state: "LINK_SENT", openingStatus: "SENT", followStatus: true, finalDeliveryStatus: "SENT" },
      { state: "EXPIRED", openingStatus: "SENT", followStatus: true, finalDeliveryStatus: "PENDING" },
    ]);

    expect(summary).toEqual({
      commented: 6,
      openingSent: 5,
      optedIn: 3,
      followed: 3,
      linkSent: 1,
    });
  });

  it("returns all zeros for an empty participant list", () => {
    expect(computeFunnelSummary([])).toEqual({ commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 });
  });
});

describe("GET /api/automations/[id]/activity", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset();
    mocks.getRepository.mockReset();
    mocks.getAutomation.mockReset();
    mocks.listParticipants.mockReset();
    mocks.countParticipantFunnel.mockReset();
    mocks.listAutomationExecutions.mockReset();
    mocks.listFacebookPages.mockReset();
    mocks.getValidatedSession.mockResolvedValue({ email: "owner@example.com", workspaceId: "workspace_a" });
    mocks.getRepository.mockReturnValue({
      getAutomation: mocks.getAutomation,
      listParticipants: mocks.listParticipants,
      countParticipantFunnel: mocks.countParticipantFunnel,
      listAutomationExecutions: mocks.listAutomationExecutions,
      listFacebookPages: mocks.listFacebookPages,
    });
    mocks.getAutomation.mockResolvedValue({ id: "automation_1", workspaceId: "workspace_a" });
    mocks.listParticipants.mockResolvedValue([]);
    mocks.countParticipantFunnel.mockResolvedValue({ commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 });
    mocks.listAutomationExecutions.mockResolvedValue([]);
    mocks.listFacebookPages.mockResolvedValue([]);
  });

  function call(id = "automation_1") {
    return GET(new Request(`http://localhost/api/automations/${id}/activity`), { params: Promise.resolve({ id }) });
  }

  it("returns 401 when there is no owner session", async () => {
    mocks.getValidatedSession.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });

  it("returns 404 when the automation does not belong to the session workspace", async () => {
    mocks.getAutomation.mockResolvedValue(null);

    const response = await call("automation_from_other_workspace");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Automation not found" });
    expect(mocks.getAutomation).toHaveBeenCalledWith("workspace_a", "automation_from_other_workspace");
    expect(mocks.listParticipants).not.toHaveBeenCalled();
    expect(mocks.countParticipantFunnel).not.toHaveBeenCalled();
  });

  it("returns newest-first participant summaries without token fields or raw identifiers", async () => {
    const newer = makeParticipant({
      id: "participant_newer",
      state: "LINK_SENT",
      followStatus: true,
      finalDeliveryStatus: "SENT",
      finalDeliveredAt: "2026-08-21T09:10:00.000Z",
      updatedAt: "2026-08-21T09:10:00.000Z",
    });
    const older = makeParticipant({
      id: "participant_older",
      state: "FOLLOW_REQUIRED",
      updatedAt: "2026-08-21T09:00:00.000Z",
    });
    // Repository already returns newest-first; the route must preserve that order.
    mocks.listParticipants.mockResolvedValue([newer, older]);
    mocks.countParticipantFunnel.mockResolvedValue({ commented: 20_001, openingSent: 15_000, optedIn: 12_000, followed: 8_000, linkSent: 6_000 });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listParticipants).toHaveBeenCalledWith("workspace_a", "automation_1", 100);
    expect(body).toEqual({
      data: [
        {
          id: "participant_newer",
          sourceMediaSnapshot: newer.sourceMediaSnapshot,
          matchedKeyword: "drop",
          state: "LINK_SENT",
          followStatus: true,
          followCheckedAt: "2026-08-21T09:00:00.000Z",
          publicReplyStatus: "SENT",
          openingStatus: "SENT",
          finalDeliveryStatus: "SENT",
          finalDeliveredAt: "2026-08-21T09:10:00.000Z",
          createdAt: newer.createdAt,
        },
        {
          id: "participant_older",
          sourceMediaSnapshot: older.sourceMediaSnapshot,
          matchedKeyword: "drop",
          state: "FOLLOW_REQUIRED",
          followStatus: false,
          followCheckedAt: "2026-08-21T09:00:00.000Z",
          publicReplyStatus: "SENT",
          openingStatus: "SENT",
          finalDeliveryStatus: "SKIPPED",
          createdAt: older.createdAt,
        },
      ],
      summary: { commented: 20_001, openingSent: 15_000, optedIn: 12_000, followed: 8_000, linkSent: 6_000 },
    });
    expect(mocks.countParticipantFunnel).toHaveBeenCalledWith("workspace_a", "automation_1");
    expect(mocks.listParticipants).toHaveBeenCalledTimes(1);

    const raw = JSON.stringify(body);
    expect(raw).not.toContain("must-not-escape");
    expect(raw).not.toContain("igScopedUserId");
    expect(raw).not.toContain("sourceCommentId");
    expect(raw).not.toContain("instagramAccountId");
    expect(raw).not.toContain("recheckCount");
    expect(raw).not.toContain("ProviderId");
    expect(raw).not.toContain("messagingWindowExpiresAt");
    expect(raw).not.toContain("workspaceId");
    expect(raw).not.toContain("webhook");
    expect(raw).not.toContain("payload");
  });

  it("returns a sanitized Facebook Page activity DTO scoped to the saved Page", async () => {
    mocks.getAutomation.mockResolvedValue({
      id: "automation_1",
      workspaceId: "workspace_a",
      provider: "FACEBOOK",
      facebookPageId: "page_1",
    });
    mocks.listFacebookPages.mockResolvedValue([
      { pageId: "page_1", pageName: "Acme Page", accessTokenEncrypted: "must-not-escape" },
      { pageId: "page_other", pageName: "Other Page", accessTokenEncrypted: "must-not-escape" },
    ]);
    mocks.listAutomationExecutions.mockResolvedValue([
      {
        id: "execution_sent",
        workspaceId: "workspace_a",
        automationId: "automation_1",
        externalEventId: "event_must-not-escape",
        dedupeKey: "dedupe_must-not-escape",
        status: "SENT",
        reason: "reply:Thanks for commenting!",
        providerMessageId: "provider_must-not-escape",
        createdAt: "2026-09-01T01:00:00.000Z",
      },
      {
        id: "execution_failed",
        workspaceId: "workspace_a",
        automationId: "automation_1",
        status: "FAILED",
        reason: "OAuth token abc_must-not-escape",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    const response = await call();
    const body = await response.json();

    expect(body.channel).toEqual({ provider: "FACEBOOK", surface: "COMMENT", connectionName: "Acme Page" });
    expect(body.data).toEqual([
      {
        id: "execution_sent",
        provider: "FACEBOOK",
        surface: "COMMENT",
        connectionName: "Acme Page",
        eventType: "comment.created",
        result: "SENT",
        replyPreview: "Thanks for commenting!",
        createdAt: "2026-09-01T01:00:00.000Z",
      },
      {
        id: "execution_failed",
        provider: "FACEBOOK",
        surface: "COMMENT",
        connectionName: "Acme Page",
        eventType: "comment.created",
        result: "FAILED",
        safeErrorCode: "delivery_failed",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("must-not-escape");
    expect(mocks.listAutomationExecutions).toHaveBeenCalledWith("workspace_a", "automation_1", 100);
  });
});
