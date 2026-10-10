import { requireManager } from "@/src/lib/auth/require-role";
import { getRepository } from "@/src/lib/repository-provider";
import { getServerEnv } from "@/src/lib/env";
import { instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
import { csvCell } from "@/src/lib/format/csv";

export const runtime = "nodejs";

const CSV_HEADER = [
    "participant_id",
    "automation_id",
    "state",
    "matched_keyword",
    "media_id",
    "created_at",
    "delivered_at",
    "clicked_at",
    "instagram_username",
];

// GET /api/insights/export - CSV of this workspace's participants for spreadsheets.
export async function GET(request: Request) {
    const guard = await requireManager(request);
    if (!guard.ok) return guard.error;
    const { session } = guard;

    const repository = getRepository();
    const automationId = new URL(request.url).searchParams.get("automationId") || undefined;
    if (automationId && !await repository.getAutomation(session.workspaceId, automationId)) {
        return new Response("Automation not found", { status: 404 });
    }
    const [rows, events] = await Promise.all([
        repository.listRecentParticipants(session.workspaceId, 5_000, automationId),
        repository.listRecentWebhookEvents(session.workspaceId, 500),
    ]);
    // Known handles only (recent events + lookup cache); no Meta calls.
    const usernames = await resolveInstagramUsernames({
        identities: rows.filter((row) => row.igScopedUserId).map((row) => ({ instagramAccountId: row.instagramAccountId, igScopedUserId: row.igScopedUserId! })),
        events,
        apiVersion: getServerEnv().metaApiVersion,
    });
    const lines = [CSV_HEADER.join(",")];
    for (const participant of rows) {
        lines.push([
            csvCell(participant.id),
            csvCell(participant.automationId),
            csvCell(participant.state),
            csvCell(participant.matchedKeyword),
            csvCell(participant.sourceMediaId),
            csvCell(participant.createdAt),
            csvCell(participant.finalDeliveredAt),
            csvCell(participant.deliveryClickedAt),
            csvCell(participant.igScopedUserId
                ? usernames.get(instagramIdentityKey({ instagramAccountId: participant.instagramAccountId, igScopedUserId: participant.igScopedUserId }))
                : undefined),
        ].join(","));
    }

    return new Response(`${lines.join("\n")}\n`, {
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="linkar-participants-${new Date().toISOString().slice(0, 10)}.csv"`,
            "cache-control": "no-store",
        },
    });
}
