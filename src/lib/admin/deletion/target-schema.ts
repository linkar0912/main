import { z } from "zod";

// User ids are Supabase UUIDs; anything else would make the Auth admin API
// throw before it can report "not found". Workspace ids are workspace_<uuid>
// (seeded demo workspaces use other safe slugs), so only their alphabet is fixed.
export const DeletionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("USER"), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("WORKSPACE"), id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict(),
]);
