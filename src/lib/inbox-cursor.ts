import { z } from "zod";

export type InboxCursorKind = "contacts" | "messages" | "activity" | "directory";

export type InboxCursor = {
  version: 1;
  kind: InboxCursorKind;
  at: string;
  id: string;
  /**
   * Inbox `sort=unread` only: whether the boundary row was unread when the
   * page was cut. Re-reading it from the database would move the boundary as
   * soon as someone opens that conversation, skipping or repeating rows.
   */
  unread?: boolean;
};

const cursorSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["contacts", "messages", "activity", "directory"]),
  at: z.iso.datetime({ offset: true }),
  id: z.string().trim().min(1).max(240),
  unread: z.boolean().optional(),
}).strict();

export function encodeInboxCursor(input: Omit<InboxCursor, "version">): string {
  const cursor = cursorSchema.parse({ version: 1, ...input });
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeInboxCursor(value: string, expectedKind: InboxCursorKind): InboxCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const cursor = cursorSchema.parse(decoded);
    if (cursor.kind !== expectedKind) throw new Error("invalid_cursor");
    return cursor;
  } catch {
    throw new Error("invalid_cursor");
  }
}
