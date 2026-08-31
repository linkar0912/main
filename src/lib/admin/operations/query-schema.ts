import { z } from "zod";
import { adminOperationKinds } from "./types";

export const OperationKindSchema = z.enum(adminOperationKinds);
const IsoDate = z.string().datetime({ offset: true });
export const AdminOperationFilterSchema = z.object({
  workspaceId: z.string().min(1).max(128).optional(),
  status: z.string().regex(/^[A-Z_]{2,40}$/).optional(),
  text: z.string().trim().min(1).max(120).optional(),
  provider: z.enum(["instagram", "facebook"]).optional(),
  from: IsoDate.optional(), to: IsoDate.optional(), cursor: z.string().max(2048).nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, "invalid_date_range");
