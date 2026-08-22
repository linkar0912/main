import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

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
];

function csvCell(value: string | undefined): string {
    const cell = value ?? "";
    // Neutralize spreadsheet formula injection the same way we quote commas.
    const safe = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
    return `"${safe.replace(/"/g, '""')}"`;
}

// GET /api/insights/export — CSV of this workspace's participants for spreadsheets.
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const rows = await getRepository().listRecentParticipants(session.workspaceId, 5_000);
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
