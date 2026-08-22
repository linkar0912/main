import { describe, expect, it, vi } from "vitest";
import { processDueSequences } from "./sequence-runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { isQuietNow, msUntilQuietEnd, toMessagingWindow } from "../messaging-window";

const TOKEN_KEY = "a".repeat(64);

async function seedTenant(
  repository: ReturnType<typeof createMemoryRepository>,
  workspaceId: string,
  igUserId: string,
  igScopedUserId: string,
  dueHoursAgo: number,
) {
  await repository.upsertConnection({
    workspaceId,
    igUserId,
    username: workspaceId,
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  const touched = await repository.touchContact(
    workspaceId,
    igUserId,
    igScopedUserId,
    new Date().toISOString(),
  );
  const sequence = await repository.createSequence(workspaceId, {
    name: `${workspaceId} drip`,
    status: "ACTIVE",
    steps: [{ id: "step-1", delayHours: 0, text: `hello from ${workspaceId}` }],
  });
  await repository.enrollContactInSequence(
    workspaceId,
    sequence.id,
    touched.record.id,
    0,
    new Date(Date.now() - dueHoursAgo * 3_600_000).toISOString(),
  );
}

describe("messaging window parsing", () => {
  it("keeps a window that starts at midnight", () => {
    // 00:00 -> 08:00 is an ordinary configuration; hour 0 must not read as "unset".
    expect(toMessagingWindow({ quietStartHour: 0, quietEndHour: 8, timezone: "UTC" })).toEqual({
      startHour: 0,
      endHour: 8,
      timezone: "UTC",
    });
  });

  it("keeps a window that ends at midnight", () => {
    expect(toMessagingWindow({ quietStartHour: 22, quietEndHour: 0, timezone: "UTC" })).toEqual({
      startHour: 22,
      endHour: 0,
      timezone: "UTC",
    });
  });

  it("treats genuinely unset columns as no window", () => {
    expect(toMessagingWindow({ quietStartHour: null, quietEndHour: null, timezone: null })).toBeNull();
    expect(toMessagingWindow({ quietStartHour: 22, quietEndHour: 8, timezone: null })).toBeNull();
    expect(toMessagingWindow({ quietStartHour: null, quietEndHour: 8, timezone: "UTC" })).toBeNull();
    expect(toMessagingWindow(null)).toBeNull();
  });
});

describe("msUntilQuietEnd", () => {
  it("resumes after the window closes, never inside it", () => {
    const window = { startHour: 22, endHour: 8, timezone: "UTC" };
    const now = new Date("2026-08-23T23:00:00Z");
    const resumeAt = new Date(now.getTime() + msUntilQuietEnd(now, window));
    // Callers that cannot re-check (broadcast job delays) must land outside the window.
    expect(isQuietNow(resumeAt, window)).toBe(false);
    expect(resumeAt.toISOString()).toBe("2026-08-24T08:00:00.000Z");
  });

  it("lands on the boundary for a same-day window", () => {
    const window = { startHour: 9, endHour: 17, timezone: "UTC" };
    const now = new Date("2026-08-23T09:30:00Z");
    const resumeAt = new Date(now.getTime() + msUntilQuietEnd(now, window));
    expect(isQuietNow(resumeAt, window)).toBe(false);
    expect(resumeAt.toISOString()).toBe("2026-08-23T17:00:00.000Z");
  });
});

describe("sequence sweep quiet hours", () => {
  it("applies each workspace's own window, not the first one in the batch", async () => {
    const repository = createMemoryRepository([]);
    // The open workspace is due earlier, so it sorts first in the batch.
    await seedTenant(repository, "ws_open", "ig_open", "lead_open", 5);
    await seedTenant(repository, "ws_quiet", "ig_quiet", "lead_quiet", 1);

    const hour = new Date().getUTCHours();
    await repository.setMessagingWindow("ws_quiet", {
      startHour: hour,
      endHour: (hour + 2) % 24,
      timezone: "UTC",
    });

    const sendDirectMessage = vi
      .fn<(c: unknown, r: string, m: { type: "text"; text: string }) => Promise<unknown>>()
      .mockResolvedValue({ message_id: "m1" });

    await processDueSequences(repository, {
      client: { sendDirectMessage },
      tokenEncryptionKey: TOKEN_KEY,
    });

    const recipients = sendDirectMessage.mock.calls.map((call) => call[1]);
    expect(recipients).toContain("lead_open");
    expect(recipients).not.toContain("lead_quiet");
  });

  it("does not hold a workspace because another workspace is quiet", async () => {
    const repository = createMemoryRepository([]);
    // This time the quiet workspace sorts first.
    await seedTenant(repository, "ws_quiet", "ig_quiet", "lead_quiet", 5);
    await seedTenant(repository, "ws_open", "ig_open", "lead_open", 1);

    const hour = new Date().getUTCHours();
    await repository.setMessagingWindow("ws_quiet", {
      startHour: hour,
      endHour: (hour + 2) % 24,
      timezone: "UTC",
    });

    const sendDirectMessage = vi
      .fn<(c: unknown, r: string, m: { type: "text"; text: string }) => Promise<unknown>>()
      .mockResolvedValue({ message_id: "m1" });

    await processDueSequences(repository, {
      client: { sendDirectMessage },
      tokenEncryptionKey: TOKEN_KEY,
    });

    const recipients = sendDirectMessage.mock.calls.map((call) => call[1]);
    expect(recipients).toContain("lead_open");
    expect(recipients).not.toContain("lead_quiet");
  });
});
