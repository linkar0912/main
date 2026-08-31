import { createHmac, timingSafeEqual } from "node:crypto";

export type AdminCursorValue = { createdAt: string; id: string };

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeAdminCursor(value: AdminCursorValue, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function decodeAdminCursor(cursor: string, secret: string): AdminCursorValue {
  try {
    const parts = cursor.split(".");
    if (parts.length !== 2) throw new Error("invalid_cursor");
    const [payload, suppliedSignature] = parts;
    const expectedSignature = signature(payload, secret);
    const supplied = Buffer.from(suppliedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error("invalid_cursor");
    }
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AdminCursorValue>;
    if (
      typeof value.id !== "string" || !value.id ||
      typeof value.createdAt !== "string" ||
      Number.isNaN(Date.parse(value.createdAt)) ||
      new Date(value.createdAt).toISOString() !== value.createdAt
    ) {
      throw new Error("invalid_cursor");
    }
    return { id: value.id, createdAt: value.createdAt };
  } catch {
    throw new Error("invalid_cursor");
  }
}
