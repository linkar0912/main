import "server-only";

import type { AdminAuditPhase } from "@prisma/client";

import { getHealth, type Health } from "@/src/lib/health";
import { prisma } from "@/src/lib/prisma";
import { getWebhookQueueCounts, type WebhookQueueCounts } from "@/src/lib/queue";

type DependencyState = Health["dependencies"]["database"];
type IntegrationState = Health["integrations"]["instagram"];

export type AdminOverviewCounts = {
  workspaces: { active: number; suspended: number };
  users: { active: number };
  connections: { instagram: number; facebook: number };
  automations: { active: number };
};

export type AdminOverviewFailure = {
  id: string;
  workspaceId: string;
  automationId: string;
  reason: string | null;
  createdAt: Date;
};

export type AdminOverviewAuditEvent = {
  id: string;
  phase: AdminAuditPhase | "ATTEMPT" | "SUCCESS" | "FAILURE";
  action: string;
  targetType: string;
  targetId: string;
  workspaceId: string | null;
  actorEmail: string;
  reason: string;
  errorCode: string | null;
  createdAt: Date;
};

export type AdminOverviewSources = {
  loadCounts: () => Promise<AdminOverviewCounts>;
  loadHealth: () => Promise<Pick<Health, "status" | "release" | "dependencies" | "integrations">>;
  loadQueue: () => Promise<WebhookQueueCounts>;
  loadFailures: () => Promise<AdminOverviewFailure[]>;
  loadAuditEvents: () => Promise<AdminOverviewAuditEvent[]>;
};

export type AdminOperatorTapeItem = {
  id: string;
  kind: "failure" | "audit";
  at: string;
  title: string;
  detail: string;
  status: "attempt" | "success" | "failed";
  workspaceId: string | null;
  targetId: string;
};

export type AdminOverviewDTO = AdminOverviewCounts & {
  generatedAt: string;
  health: {
    status: Health["status"];
    release: string | null;
    database: DependencyState;
    redis: DependencyState;
    instagram: IntegrationState;
    facebook: IntegrationState;
  };
  queue: WebhookQueueCounts;
  operatorTape: AdminOperatorTapeItem[];
};

const TAPE_LIMIT = 20;
const DETAIL_LIMIT = 500;

function safeDetail(value: string | null | undefined, fallback: string): string {
  return (value?.trim() || fallback).slice(0, DETAIL_LIMIT);
}

function auditStatus(phase: AdminOverviewAuditEvent["phase"]): AdminOperatorTapeItem["status"] {
  if (phase === "SUCCESS") return "success";
  if (phase === "FAILURE") return "failed";
  return "attempt";
}

export async function loadAdminOverview(sources: AdminOverviewSources = productionSources): Promise<AdminOverviewDTO> {
  const [counts, health, queue, failures, auditEvents] = await Promise.all([
    sources.loadCounts(),
    sources.loadHealth(),
    sources.loadQueue(),
    sources.loadFailures(),
    sources.loadAuditEvents(),
  ]);

  const operatorTape: AdminOperatorTapeItem[] = [
    ...failures.map((failure): AdminOperatorTapeItem => ({
      id: `failure-${failure.id}`,
      kind: "failure",
      at: failure.createdAt.toISOString(),
      title: "Automation delivery failed",
      detail: safeDetail(failure.reason, "No failure reason was recorded."),
      status: "failed",
      workspaceId: failure.workspaceId,
      targetId: failure.automationId,
    })),
    ...auditEvents.map((event): AdminOperatorTapeItem => ({
      id: `audit-${event.id}`,
      kind: "audit",
      at: event.createdAt.toISOString(),
      title: event.action,
      detail: safeDetail(event.errorCode ? `${event.reason} · ${event.errorCode}` : event.reason, "Operator action"),
      status: auditStatus(event.phase),
      workspaceId: event.workspaceId,
      targetId: event.targetId,
    })),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, TAPE_LIMIT);

  return {
    generatedAt: new Date().toISOString(),
    ...counts,
    health: {
      status: health.status,
      release: health.release,
      database: health.dependencies.database,
      redis: health.dependencies.redis,
      instagram: health.integrations.instagram,
      facebook: health.integrations.facebook,
    },
    queue,
    operatorTape,
  };
}

const productionSources: AdminOverviewSources = {
  async loadCounts() {
    const [activeWorkspaces, suspendedWorkspaces, users, instagram, facebook, activeAutomations] = await Promise.all([
      prisma.workspace.count({ where: { status: "ACTIVE" } }),
      prisma.workspace.count({ where: { status: { in: ["SUSPENDED", "DELETION_PENDING"] } } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(DISTINCT COALESCE("userId", lower("email"))) AS "count" FROM "WorkspaceMember"`,
      prisma.instagramConnection.count({ where: { status: "CONNECTED" } }),
      prisma.facebookPageConnection.count({ where: { status: "CONNECTED" } }),
      prisma.automation.count({ where: { status: "ACTIVE" } }),
    ]);
    return {
      workspaces: { active: activeWorkspaces, suspended: suspendedWorkspaces },
      users: { active: Number(users[0]?.count ?? 0) },
      connections: { instagram, facebook },
      automations: { active: activeAutomations },
    };
  },
  loadHealth: getHealth,
  loadQueue: getWebhookQueueCounts,
  loadFailures: () => prisma.automationExecution.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: TAPE_LIMIT,
    select: { id: true, workspaceId: true, automationId: true, reason: true, createdAt: true },
  }),
  loadAuditEvents: () => prisma.adminAuditEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TAPE_LIMIT,
    select: {
      id: true,
      phase: true,
      action: true,
      targetType: true,
      targetId: true,
      workspaceId: true,
      actorEmail: true,
      reason: true,
      errorCode: true,
      createdAt: true,
    },
  }),
};
