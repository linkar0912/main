export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createAuditCsv(rows: Array<Record<string, unknown>>): string {
  const columns = ["id", "requestId", "phase", "actorEmail", "action", "targetType", "targetId", "workspaceId", "reason", "errorCode", "origin", "createdAt"];
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n";
}
