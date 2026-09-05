import "server-only";

import { getServerEnv } from "@/src/lib/env";
import { sendEmail, type OutboundEmail } from "@/src/lib/mailer";
import { prisma } from "@/src/lib/prisma";

type PendingIncident = {
  id: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  severity: "WARNING" | "CRITICAL";
  source: string;
  title: string;
  detail: string;
  firstSeenAt: Date;
  resolvedAt: Date | null;
};

export interface IncidentAlertRepository {
  listPending(): Promise<PendingIncident[]>;
  markNotificationSent(id: string, now: Date): Promise<unknown>;
  markRecoverySent(id: string, now: Date): Promise<unknown>;
}

export const prismaIncidentAlertRepository: IncidentAlertRepository = {
  listPending() {
    return prisma.adminIncident.findMany({
      where: {
        OR: [
          { status: { in: ["OPEN", "ACKNOWLEDGED"] }, notificationSentAt: null },
          { status: "RESOLVED", recoverySentAt: null },
        ],
      },
      orderBy: [{ severity: "desc" }, { firstSeenAt: "asc" }],
      select: {
        id: true, status: true, severity: true, source: true, title: true,
        detail: true, firstSeenAt: true, resolvedAt: true,
      },
    });
  },
  markNotificationSent(id, now) {
    return prisma.adminIncident.update({ where: { id }, data: { notificationSentAt: now } });
  },
  markRecoverySent(id, now) {
    return prisma.adminIncident.update({ where: { id }, data: { recoverySentAt: now } });
  },
};

function emailFor(incident: PendingIncident, recipient: string, adminUrl: string): OutboundEmail {
  const recovered = incident.status === "RESOLVED";
  const severity = incident.severity.toLowerCase();
  const lifecycle = recovered ? "recovered" : "open";
  return {
    to: recipient,
    subject: recovered ? `[Linkar recovered] ${incident.title}` : `[Linkar ${severity}] ${incident.title}`,
    body: [
      recovered ? "A Linkar production incident has recovered." : "Linkar detected a production incident.",
      "",
      `Service: ${incident.source}`,
      `Severity: ${incident.severity}`,
      `First seen: ${incident.firstSeenAt.toISOString()}`,
      ...(recovered && incident.resolvedAt ? [`Recovered: ${incident.resolvedAt.toISOString()}`] : []),
      `Detail: ${incident.detail}`,
      "",
      `Admin: ${adminUrl}/admin/system`,
    ].join("\n"),
    idempotencyKey: `incident:${incident.id}:${lifecycle}:${severity}:${recipient}`,
  };
}

export async function dispatchPendingIncidentAlerts(options: {
  recipients: string[];
  repository: IncidentAlertRepository;
  send: (email: OutboundEmail) => Promise<{ delivered: boolean }>;
  now: Date;
  adminUrl: string;
}): Promise<{ attempted: number; delivered: number }> {
  const pending = await options.repository.listPending();
  let delivered = 0;
  for (const incident of pending) {
    if (options.recipients.length === 0) continue;
    const results = await Promise.all(options.recipients.map((recipient) => options.send(emailFor(incident, recipient, options.adminUrl))));
    if (!results.every((result) => result.delivered)) continue;
    if (incident.status === "RESOLVED") await options.repository.markRecoverySent(incident.id, options.now);
    else await options.repository.markNotificationSent(incident.id, options.now);
    delivered += 1;
  }
  return { attempted: pending.length, delivered };
}

export async function dispatchConfiguredIncidentAlerts(now = new Date()) {
  const env = getServerEnv();
  return dispatchPendingIncidentAlerts({
    recipients: env.platformAlertEmails,
    repository: prismaIncidentAlertRepository,
    send: sendEmail,
    now,
    adminUrl: env.adminUrl,
  });
}
