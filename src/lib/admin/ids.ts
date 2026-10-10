import { z } from "zod";

// Supabase Auth rejects a malformed user id with a thrown validation error
// instead of a not-found result, so route and page boundaries check the shape
// first and answer 404 like any other unknown user.
const AdminUserId = z.string().uuid();

export function isAdminUserId(value: string): boolean {
  return AdminUserId.safeParse(value).success;
}
