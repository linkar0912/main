import { z } from "zod";

const Text = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(500).optional());
const DateFilter = z.preprocess((value) => value === "" ? undefined : value, z.string().datetime({ offset: true }).optional());
export const AuditFilterFields = z.object({
  actor: Text, action: Text, targetType: Text, targetId: Text, workspaceId: Text, requestId: Text, origin: Text,
  phase: z.preprocess((value) => value === "" ? undefined : value, z.enum(["ATTEMPT", "SUCCESS", "FAILURE"]).optional()),
  from: DateFilter, to: DateFilter,
}).strict();
const validRange = (filter: { from?: string; to?: string }) => !filter.from || !filter.to || Date.parse(filter.from) <= Date.parse(filter.to);
export const AuditExportFilterSchema = AuditFilterFields.refine(validRange, "invalid_date_range");
export const AuditFilterSchema = AuditFilterFields.extend({
  cursor: z.string().max(2048).nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).refine(validRange, "invalid_date_range");
