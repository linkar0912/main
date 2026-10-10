// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AdminOverviewScreen } from "./admin-overview-screen";
import type { AdminOverviewDTO } from "@/src/lib/admin/overview";

const overview: AdminOverviewDTO = {
  generatedAt: "2026-08-31T10:00:00.000Z",
  workspaces: { active: 12, suspended: 2 },
  users: { active: 18 },
  connections: { instagram: 7, facebook: 4 },
  automations: { active: 21 },
  health: {
    status: "degraded",
    release: "e4afaee",
    database: "ok",
    redis: "error",
    instagram: "configured",
    facebook: "configured",
  },
  queue: { state: "error", waiting: 0, active: 0, delayed: 0, failed: 3 },
  operatorTape: [{
    id: "failure-f1",
    kind: "failure",
    at: "2026-08-31T09:59:00.000Z",
    title: "Automation delivery failed",
    detail: "Provider rejected message",
    status: "failed",
    workspaceId: "workspace-1",
    workspaceName: "Acme Studio",
    actor: null,
    targetId: "automation-1",
  }, {
    id: "audit-a1",
    kind: "audit",
    at: "2026-08-31T09:58:00.000Z",
    title: "premium_invite.create",
    detail: "Creator launch",
    status: "success",
    workspaceId: null,
    workspaceName: null,
    actor: "owner@linkar.in",
    targetId: "invite-1",
  }],
};

describe("AdminOverviewScreen", () => {
  afterEach(cleanup);

  it("renders real totals, degraded dependencies, and recent activity in plain words", () => {
    render(<AdminOverviewScreen overview={overview} />);

    expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Job queue (Redis)").parentElement?.textContent).toContain("Down");
    expect(screen.getByText("Provider rejected message")).toBeTruthy();
    expect(screen.getByText("A message failed to send")).toBeTruthy();
    expect(screen.getByText("Created an invite code")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Acme Studio" }).getAttribute("href")).toBe("/admin/workspaces/workspace-1");
    expect(screen.getByText("e4afaee")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/UTC|premium_invite\.create/);
  });

  it("renders an explicit empty state when there is no operator history", () => {
    render(<AdminOverviewScreen overview={{ ...overview, operatorTape: [] }} />);

    expect(screen.getByText(/No recent activity/)).toBeTruthy();
  });
});
