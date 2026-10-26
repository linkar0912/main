import { randomUUID } from "node:crypto";

import { z } from "zod";

import { DeletionTargetSchema } from "@/src/lib/admin/deletion/target-schema";
import type { AdminKeyPrincipal } from "@/src/lib/admin/mcp/principal";
import type { McpTool, McpToolResult } from "@/src/lib/admin/mcp/protocol";
import { adminOperationActions, adminOperationKinds, adminOperationStatuses } from "@/src/lib/admin/operations/types";
import { PlanValuesSchema } from "@/src/lib/admin/plan-service";
import { EntitlementOverridesSchema } from "@/src/lib/entitlements/types";
import { ADMIN_QUEUE_NAMES } from "@/src/lib/queue";

import * as auditExportRoute from "../audit/export/route";
import * as auditRoute from "../audit/route";
import * as dataDeletionsRoute from "../compliance/data-deletions/route";
import * as deletionJobRoute from "../deletions/[id]/route";
import * as deletionPreviewRoute from "../deletions/preview/route";
import * as deletionsRoute from "../deletions/route";
import * as syntheticPreviewRoute from "../deletions/synthetic/preview/route";
import * as syntheticRoute from "../deletions/synthetic/route";
import * as integrationRoute from "../integrations/[provider]/[id]/route";
import * as integrationsRoute from "../integrations/route";
import * as inviteAccessRoute from "../invite-codes/[id]/access/route";
import * as inviteCodeRoute from "../invite-codes/[id]/route";
import * as inviteCodesRoute from "../invite-codes/route";
import * as operationRoute from "../operations/[kind]/[id]/route";
import * as operationsRoute from "../operations/[kind]/route";
import * as overviewRoute from "../overview/route";
import * as planRoute from "../plans/[planId]/route";
import * as plansRoute from "../plans/route";
import * as queueRoute from "../system/queues/[queue]/route";
import * as systemRoute from "../system/route";
import * as userAccessRoute from "../users/[userId]/access/route";
import * as userMembershipsRoute from "../users/[userId]/memberships/route";
import * as userResetRoute from "../users/[userId]/reset/route";
import * as userRoute from "../users/[userId]/route";
import * as usersRoute from "../users/route";
import * as workspaceRoute from "../workspaces/[workspaceId]/route";
import * as workspacePauseRoute from "../workspaces/[workspaceId]/automations/pause/route";
import * as workspaceResumeRoute from "../workspaces/[workspaceId]/automations/resume/route";
import * as workspaceEntitlementRoute from "../workspaces/[workspaceId]/entitlement/route";
import * as workspaceExportRoute from "../workspaces/[workspaceId]/export/route";
import * as workspaceLifecycleRoute from "../workspaces/[workspaceId]/lifecycle/route";
import * as workspaceMembersRoute from "../workspaces/[workspaceId]/members/route";
import * as workspacesRoute from "../workspaces/route";
import { callAdminRoute, type AdminRouteCall, type AdminRouteHandler, type AdminRouteMethod, type AdminRouteResult } from "./dispatch";

export const ADMIN_MCP_INSTRUCTIONS = [
  "Linkar owner console. Every tool works on live production data as the platform owner who created this key, and every change is written to the admin audit log with the reason you give.",
  "Write tools need a `reason`: one specific sentence an operator would recognise later (for example \"Customer asked to close the account, ticket 482\"). Never put secrets or tokens in a reason.",
  "Most changes need the record's current `version`. Read the record first (get_workspace, get_workspace_entitlement, get_operation, get_integration, list_plans) and pass the version you saw. A conflict means it changed since; read it again rather than retrying blindly.",
  "Two-step actions: preview_deletion then request_deletion, preview_synthetic_cleanup then request_synthetic_cleanup, prepare_integration_disconnect then disconnect_integration. The first step returns what will be affected, a confirmation phrase and a single-use challenge token that expires after about 10 minutes. Show the user the impact and the phrase and get their explicit go-ahead before the second step, then pass the phrase and token exactly.",
  "Workspaces a platform owner belongs to are protected and refuse admin commands. Owner MFA and MCP keys can only be managed in the browser console.",
].join("\n\n");

type ToolContext = { incoming: Request; principal: AdminKeyPrincipal; dispatch: typeof callAdminRoute };
type Issue = { path: string; message: string };
type Fields = Record<string, unknown>;

export type AdminMcpToolSpec = {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  destructive: boolean;
  /** Emails someone or calls Meta, beyond Linkar's own data. */
  openWorld: boolean;
  route?: string;
  method?: AdminRouteMethod;
  handler?: AdminRouteHandler;
  schema: z.ZodObject;
  inputSchema: Record<string, unknown>;
  run(input: Fields, context: ToolContext): Promise<McpToolResult>;
};

const WRITE_FIELDS = {
  reason: z.string().trim().min(3).max(500).describe("Why you are doing this, recorded in the admin audit log."),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{16,128}$/).optional()
    .describe("Optional. When a call may have gone through (it timed out, say), repeat it with the same key: it is then refused with operation_already_requested instead of running twice, and you should read the record to see whether the first call worked."),
};

// Claude Code refuses tool output much past 25,000 tokens, so a long result
// (a workspace or audit export) is cut with a note instead of failing there
// after the export was already recorded.
const MAX_RESULT_CHARACTERS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(body: unknown, isError = false): McpToolResult {
  const full = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  if (isError) return { isError: true, content: [{ type: "text", text: full }] };
  if (full.length <= MAX_RESULT_CHARACTERS) return { content: [{ type: "text", text: full }] };
  return {
    content: [
      { type: "text", text: full.slice(0, MAX_RESULT_CHARACTERS) },
      { type: "text", text: `[Cut short: showing the first ${MAX_RESULT_CHARACTERS.toLocaleString("en-US")} of ${full.length.toLocaleString("en-US")} characters. Narrow the request, or download the full file from the owner console.]` },
    ],
  };
}

const READ_ONLY_REFUSAL = text({ status: 403, error: "mcp_key_read_only", message: "This MCP key is read only. Create a read and write key on the Security page to make changes." }, true);

function invalidArguments(issues: Issue[]): McpToolResult {
  return text({ error: "invalid_arguments", issues }, true);
}

function routeResult(result: AdminRouteResult): McpToolResult {
  if (result.ok) return text(result.body);
  const body = isRecord(result.body) ? result.body : {};
  return text({
    status: result.status,
    error: typeof body.error === "string" ? body.error : "request_failed",
    ...(typeof body.message === "string" ? { message: body.message } : {}),
  }, true);
}

function jsonSchema(schema: z.ZodObject): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
}

function routeParamNames(route: string): string[] {
  return [...route.matchAll(/\[([A-Za-z]+)\]/g)].map((match) => match[1]);
}

/**
 * One console route as a tool. By default the route's [params] come from the
 * fields of the same name, and the other fields become the query string
 * (GET) or the JSON body; `request` overrides that for routes whose body
 * carries a fixed command.
 */
function routeTool<Shape extends z.ZodRawShape>(spec: {
  name: string;
  title: string;
  description: string;
  access: "read" | "write";
  destructive?: boolean;
  openWorld?: boolean;
  method: AdminRouteMethod;
  route: string;
  handler: AdminRouteHandler;
  input: Shape;
  check?: (input: z.infer<z.ZodObject<Shape>>) => Issue | null;
  request?: (input: z.infer<z.ZodObject<Shape>>) => Pick<AdminRouteCall, "query" | "body">;
}): AdminMcpToolSpec {
  const schema = z.object({ ...spec.input, ...(spec.access === "write" ? WRITE_FIELDS : {}) }).strict();
  const paramNames = routeParamNames(spec.route);
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    access: spec.access,
    destructive: spec.destructive ?? false,
    openWorld: spec.openWorld ?? false,
    route: spec.route,
    method: spec.method,
    handler: spec.handler,
    schema,
    inputSchema: jsonSchema(schema),
    async run(input, { incoming, dispatch }) {
      const { reason, idempotencyKey, ...fields } = input;
      const typed = fields as z.infer<z.ZodObject<Shape>>;
      const issue = spec.check?.(typed);
      if (issue) return invalidArguments([issue]);

      const params: Record<string, string> = {};
      const rest: Fields = {};
      for (const [name, value] of Object.entries(fields)) {
        if (paramNames.includes(name)) params[name] = String(value);
        else rest[name] = value;
      }
      const call: AdminRouteCall = { method: spec.method, route: spec.route };
      if (paramNames.length) call.params = params;
      Object.assign(call, spec.request ? spec.request(typed) : spec.method === "GET" ? { query: rest } : { body: rest });
      if (spec.access === "write") {
        call.write = { reason: String(reason), idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : `mcp-${randomUUID()}` };
      }
      return routeResult(await dispatch(spec.handler, call, incoming));
    },
  };
}

const UserId = z.string().uuid().describe("Supabase Auth user id (UUID).");
const WorkspaceId = z.string().min(1).max(128).describe("Workspace id, usually workspace_<uuid>.");
const Version = z.number().int().positive().describe("The record's version from your latest read.");
const Cursor = z.string().min(1).max(2048).optional().describe("nextCursor from the previous page.");
const Limit = z.number().int().min(1).max(100).optional().describe("Page size, 1 to 100.");
const IsoDate = z.string().datetime({ offset: true });
const Provider = z.enum(["instagram", "facebook"]);
const IntegrationId = z.string().min(1).max(128).describe("Connection id from list_integrations.");
const Queue = z.enum(ADMIN_QUEUE_NAMES).describe("webhooks: realtime events and follow-ups. bulk: broadcasts and lead delivery.");
const AuditText = z.string().trim().min(1).max(500).optional();
const AUDIT_FILTERS = {
  actor: AuditText.describe("Owner email or user id."),
  action: AuditText.describe("Audit action, e.g. workspace.suspend."),
  targetType: AuditText,
  targetId: AuditText,
  workspaceId: AuditText,
  requestId: AuditText,
  origin: AuditText.describe("Where the change came from; MCP calls are recorded as \"mcp\"."),
  mcpKeyId: AuditText.describe("Only changes made with this MCP key (keyId from whoami)."),
  phase: z.enum(["ATTEMPT", "SUCCESS", "FAILURE"]).optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
};

const OPERATION_ACTIONS = [...new Set(Object.values(adminOperationActions).flat())] as [string, ...string[]];
const describeByKind = (map: Record<string, readonly string[]>) => Object.entries(map).map(([kind, values]) => `${kind}: ${values.join(", ")}`).join("; ");

export const adminMcpToolCatalog: readonly AdminMcpToolSpec[] = [
  {
    name: "whoami",
    title: "Who am I",
    description: "Shows which MCP key this is, its access (READ or WRITE), when it expires, and the platform owner it acts for.",
    access: "read",
    destructive: false,
    openWorld: false,
    schema: z.object({}).strict(),
    inputSchema: jsonSchema(z.object({}).strict()),
    async run(_input, { principal }) {
      return text({ keyId: principal.keyId, label: principal.label, scope: principal.scope, expiresAt: principal.expiresAt, owner: { userId: principal.owner.userId, email: principal.owner.email } });
    },
  },

  // Overview and system
  routeTool({ name: "get_overview", title: "Platform overview", description: "Platform totals and attention items shown on the console home page: users, workspaces, plans, failures and anything needing an owner.", access: "read", method: "GET", route: "/api/admin/overview", handler: overviewRoute.GET, input: {} }),
  routeTool({ name: "get_system_status", title: "System status", description: "Health of the web app, PostgreSQL, Valkey, the worker and both queues, plus configuration presence, throughput, open incidents and reconciliation status.", access: "read", method: "GET", route: "/api/admin/system", handler: systemRoute.GET, input: {} }),
  routeTool({
    name: "run_reconciliation", title: "Run reconciliation", description: "Queues the delivery reconciliation (settles deliveries stuck in an unknown state) or the usage reconciliation (recounts plan usage).", access: "write", method: "POST", route: "/api/admin/system", handler: systemRoute.POST,
    input: { kind: z.enum(["delivery", "usage"]) },
    request: ({ kind }) => ({ body: { action: kind === "delivery" ? "run_delivery_reconciliation" : "run_usage_reconciliation" } }),
  }),
  routeTool({ name: "list_failed_queue_jobs", title: "Failed queue jobs", description: "The 50 most recent failed jobs on a queue, with job name, safe failure code, attempt count and failure time.", access: "read", method: "GET", route: "/api/admin/system/queues/[queue]", handler: queueRoute.GET, input: { queue: Queue } }),
  routeTool({ name: "pause_queue", destructive: true, title: "Pause queue", description: "Stops a queue from claiming new work, for an incident. Jobs stay queued until resume_queue.", access: "write", method: "PATCH", route: "/api/admin/system/queues/[queue]", handler: queueRoute.PATCH, input: { queue: Queue }, request: () => ({ body: { action: "pause" } }) }),
  routeTool({ name: "resume_queue", title: "Resume queue", description: "Lets a paused queue claim work again.", access: "write", method: "PATCH", route: "/api/admin/system/queues/[queue]", handler: queueRoute.PATCH, input: { queue: Queue }, request: () => ({ body: { action: "resume" } }) }),
  routeTool({
    name: "retry_failed_queue_jobs", openWorld: true, title: "Retry failed jobs", description: "Retries selected failed jobs (ids from list_failed_queue_jobs). Only retry jobs whose cause is fixed; the call is refused if any job is no longer failed.", access: "write", method: "PATCH", route: "/api/admin/system/queues/[queue]", handler: queueRoute.PATCH,
    input: { queue: Queue, jobIds: z.array(z.string().min(1).max(200)).min(1).max(100) },
    request: ({ jobIds }) => ({ body: { action: "retry_failed_jobs", jobIds } }),
  }),

  // Users
  routeTool({ name: "search_users", title: "Search users", description: "Lists Supabase Auth users with their Linkar access and workspace memberships. search matches email or id. Reads at most the first 5,000 identities and says when it stops early.", access: "read", method: "GET", route: "/api/admin/users", handler: usersRoute.GET, input: { search: z.string().trim().min(1).max(200).optional(), limit: Limit, cursor: Cursor } }),
  routeTool({ name: "get_user", title: "User details", description: "One user's account, Linkar access state, Auth ban state and workspace memberships.", access: "read", method: "GET", route: "/api/admin/users/[userId]", handler: userRoute.GET, input: { userId: UserId } }),
  routeTool({ name: "create_user", openWorld: true, title: "Create or invite user", description: "INVITE emails the person an invitation; CREATE makes the account without an email (confirmed marks the address as confirmed).", access: "write", method: "POST", route: "/api/admin/users", handler: usersRoute.POST, input: { email: z.string().email(), mode: z.enum(["INVITE", "CREATE"]), confirmed: z.boolean().optional() } }),
  routeTool({ name: "update_user_email", destructive: true, openWorld: true, title: "Change user email", description: "Changes a user's sign-in email. confirmEmail marks the new address as confirmed.", access: "write", method: "PATCH", route: "/api/admin/users/[userId]", handler: userRoute.PATCH, input: { userId: UserId, email: z.string().email(), confirmEmail: z.boolean().optional() } }),
  routeTool({
    name: "set_user_access", title: "Change user access", destructive: true, method: "POST", route: "/api/admin/users/[userId]/access", handler: userAccessRoute.POST, access: "write",
    description: "SUSPEND blocks Linkar access and RESTORE lifts it. REVOKE_LINKAR_SESSIONS signs the user out everywhere. BAN blocks Supabase Auth sign-in and UNBAN lifts it. Unbanning never lifts a suspension, and access cannot be restored while a ban is in force.",
    input: { userId: UserId, action: z.enum(["SUSPEND", "RESTORE", "REVOKE_LINKAR_SESSIONS", "BAN", "UNBAN"]) },
  }),
  routeTool({ name: "send_password_reset", openWorld: true, title: "Send password reset", description: "Emails the user a password reset link.", access: "write", method: "POST", route: "/api/admin/users/[userId]/reset", handler: userResetRoute.POST, input: { userId: UserId } }),
  routeTool({
    name: "change_user_membership", title: "Change user's workspace membership", destructive: true, method: "POST", route: "/api/admin/users/[userId]/memberships", handler: userMembershipsRoute.POST, access: "write",
    description: "Adds the user to a workspace, changes their role there, or removes them. role is needed for ADD and CHANGE_ROLE.",
    input: { userId: UserId, action: z.enum(["ADD", "CHANGE_ROLE", "REMOVE"]), workspaceId: WorkspaceId, role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional() },
  }),

  // Workspaces
  routeTool({ name: "list_workspaces", title: "List workspaces", description: "Lists workspaces with status, plan and member counts. search matches name, slug or id.", access: "read", method: "GET", route: "/api/admin/workspaces", handler: workspacesRoute.GET, input: { search: z.string().trim().min(1).max(200).optional(), limit: Limit, cursor: Cursor } }),
  routeTool({ name: "get_workspace", title: "Workspace details", description: "One workspace: status, version, members, connections, plan and usage.", access: "read", method: "GET", route: "/api/admin/workspaces/[workspaceId]", handler: workspaceRoute.GET, input: { workspaceId: WorkspaceId } }),
  routeTool({ name: "create_workspace", title: "Create workspace", description: "Creates a workspace owned by an existing user.", access: "write", method: "POST", route: "/api/admin/workspaces", handler: workspacesRoute.POST, input: { name: z.string().trim().min(1).max(120), slug: z.string().trim().min(3).max(64), ownerUserId: UserId } }),
  routeTool({
    name: "update_workspace", title: "Rename workspace", description: "Changes a workspace's name and/or slug.", access: "write", method: "PATCH", route: "/api/admin/workspaces/[workspaceId]", handler: workspaceRoute.PATCH,
    input: { workspaceId: WorkspaceId, name: z.string().trim().min(1).max(120).optional(), slug: z.string().trim().min(3).max(64).optional(), version: Version },
    check: ({ name, slug }) => name === undefined && slug === undefined ? { path: "name", message: "Give a new name, a new slug, or both." } : null,
  }),
  routeTool({ name: "set_workspace_lifecycle", title: "Suspend or restore workspace", description: "SUSPEND stops the workspace's automations and blocks its members; RESTORE reopens it.", destructive: true, access: "write", method: "POST", route: "/api/admin/workspaces/[workspaceId]/lifecycle", handler: workspaceLifecycleRoute.POST, input: { workspaceId: WorkspaceId, action: z.enum(["SUSPEND", "RESTORE"]), version: Version } }),
  routeTool({ name: "change_workspace_member", destructive: true, title: "Change workspace member", description: "Adds an existing user to the workspace, changes their role, or transfers ownership to them. role (ADMIN or MEMBER) is needed for ADD and CHANGE_ROLE.", access: "write", method: "POST", route: "/api/admin/workspaces/[workspaceId]/members", handler: workspaceMembersRoute.POST, input: { workspaceId: WorkspaceId, action: z.enum(["ADD", "CHANGE_ROLE", "TRANSFER_OWNERSHIP"]), userId: UserId, role: z.enum(["ADMIN", "MEMBER"]).optional() } }),
  routeTool({ name: "remove_workspace_member", title: "Remove workspace member", description: "Removes a member from the workspace. The owner cannot be removed; transfer ownership first.", destructive: true, access: "write", method: "DELETE", route: "/api/admin/workspaces/[workspaceId]/members", handler: workspaceMembersRoute.DELETE, input: { workspaceId: WorkspaceId, userId: UserId }, request: ({ userId }) => ({ query: { userId } }) }),
  routeTool({ name: "get_workspace_entitlement", title: "Workspace plan and limits", description: "The workspace's plan, any per-workspace overrides, the resulting limits and the entitlement version.", access: "read", method: "GET", route: "/api/admin/workspaces/[workspaceId]/entitlement", handler: workspaceEntitlementRoute.GET, input: { workspaceId: WorkspaceId } }),
  routeTool({ name: "update_workspace_entitlement", title: "Change workspace plan or limits", description: "Moves the workspace to a plan (planId from list_plans). overrides holds per-workspace exceptions: pass {} to use the plan's values, a number to change a limit, null for unlimited, or a boolean for a feature switch.", access: "write", method: "PATCH", route: "/api/admin/workspaces/[workspaceId]/entitlement", handler: workspaceEntitlementRoute.PATCH, input: { workspaceId: WorkspaceId, planId: z.string().min(1).max(128), overrides: EntitlementOverridesSchema, version: Version.describe("Entitlement version from get_workspace_entitlement.") } }),
  routeTool({ name: "pause_workspace_automations", title: "Pause all automations", description: "Pauses every active automation in the workspace and remembers which ones, so resume_workspace_automations re-activates exactly those.", access: "write", method: "POST", route: "/api/admin/workspaces/[workspaceId]/automations/pause", handler: workspacePauseRoute.POST, input: { workspaceId: WorkspaceId, version: Version } }),
  routeTool({ name: "resume_workspace_automations", title: "Resume paused automations", description: "Re-activates the automations the last pause_workspace_automations stopped, skipping any edited since.", access: "write", method: "POST", route: "/api/admin/workspaces/[workspaceId]/automations/resume", handler: workspaceResumeRoute.POST, input: { workspaceId: WorkspaceId, version: Version } }),
  routeTool({ name: "export_workspace", title: "Export workspace data", description: "Exports the workspace's members, automations and contacts as CSV or JSON. Copies customer data, so give a reason. Refused above 50,000 rows.", access: "write", method: "POST", route: "/api/admin/workspaces/[workspaceId]/export", handler: workspaceExportRoute.POST, input: { workspaceId: WorkspaceId, format: z.enum(["csv", "json"]) } }),

  // Plans and invite codes
  routeTool({ name: "list_plans", title: "List plans", description: "Every plan template with its limits, feature switches, active state and version.", access: "read", method: "GET", route: "/api/admin/plans", handler: plansRoute.GET, input: {} }),
  routeTool({ name: "create_plan", title: "Create plan", description: "Creates a plan template. A null limit means unlimited.", access: "write", method: "POST", route: "/api/admin/plans", handler: plansRoute.POST, input: { key: z.string().min(2).max(40), ...PlanValuesSchema.shape } }),
  routeTool({ name: "update_plan", title: "Update plan", description: "Replaces a plan template's name, limits and feature switches. Workspaces on the plan get the new limits.", access: "write", method: "PATCH", route: "/api/admin/plans/[planId]", handler: planRoute.PATCH, input: { planId: z.string().min(1).max(128), ...PlanValuesSchema.shape, version: Version } }),
  routeTool({ name: "retire_plan", title: "Retire plan", description: "Retires a plan so it can no longer be chosen. Workspaces already on it keep it.", destructive: true, access: "write", method: "DELETE", route: "/api/admin/plans/[planId]", handler: planRoute.DELETE, input: { planId: z.string().min(1).max(128), version: Version } }),
  routeTool({ name: "list_invite_codes", title: "List premium invite codes", description: "Premium invite codes with their plan, duration, expiry, redemption and revocation state.", access: "read", method: "GET", route: "/api/admin/invite-codes", handler: inviteCodesRoute.GET, input: {} }),
  routeTool({ name: "create_invite_code", title: "Create premium invite code", description: "Creates a code that grants a plan (planKey from list_plans) when redeemed. expiresAt is when the code stops being redeemable.", access: "write", method: "POST", route: "/api/admin/invite-codes", handler: inviteCodesRoute.POST, input: { label: z.string().trim().min(2).max(120), planKey: z.string().trim().min(2).max(40), expiresAt: z.string().datetime().nullable().optional() } }),
  routeTool({ name: "revoke_invite_code", title: "Revoke invite code", description: "Stops an unredeemed invite code from being redeemed.", destructive: true, access: "write", method: "DELETE", route: "/api/admin/invite-codes/[id]", handler: inviteCodeRoute.DELETE, input: { id: z.string().min(1).max(128) } }),
  routeTool({ name: "end_invite_access", title: "End invite access", description: "Ends the premium access a redeemed invite code granted, ahead of its expiry.", destructive: true, access: "write", method: "DELETE", route: "/api/admin/invite-codes/[id]/access", handler: inviteAccessRoute.DELETE, input: { id: z.string().min(1).max(128) } }),

  // Integrations
  routeTool({ name: "list_integrations", title: "List integrations", description: "Instagram and Facebook connections with status, token expiry and workspace.", access: "read", method: "GET", route: "/api/admin/integrations", handler: integrationsRoute.GET, input: { provider: Provider.optional(), workspaceId: WorkspaceId.optional(), status: z.enum(["CONNECTED", "DISCONNECTED", "EXPIRED"]).optional(), expiry: z.enum(["expired", "within_24_hours", "within_7_days", "within_30_days", "later", "unknown"]).optional(), text: z.string().trim().min(1).max(120).optional(), cursor: Cursor } }),
  routeTool({ name: "get_integration", title: "Integration details", description: "One connection: account, workspace, status, token expiry, webhook subscription and version.", access: "read", method: "GET", route: "/api/admin/integrations/[provider]/[id]", handler: integrationRoute.GET, input: { provider: Provider, id: IntegrationId } }),
  routeTool({ name: "run_integration_action", openWorld: true, title: "Repair integration", description: "refresh_token renews the access token, mark_expired flags it as expired, repair_subscription re-subscribes the account to webhooks.", access: "write", method: "PATCH", route: "/api/admin/integrations/[provider]/[id]", handler: integrationRoute.PATCH, input: { provider: Provider, id: IntegrationId, action: z.enum(["refresh_token", "mark_expired", "repair_subscription"]), version: Version } }),
  routeTool({ name: "prepare_integration_disconnect", title: "Prepare integration disconnect", description: "First step of disconnecting an account: returns a confirmation phrase and a challenge token for disconnect_integration.", access: "write", method: "PATCH", route: "/api/admin/integrations/[provider]/[id]", handler: integrationRoute.PATCH, input: { provider: Provider, id: IntegrationId, version: Version }, request: ({ version }) => ({ body: { action: "prepare_disconnect", version } }) }),
  routeTool({ name: "disconnect_integration", openWorld: true, title: "Disconnect integration", description: "Disconnects the account from its workspace; its automations stop. Needs the phrase and token from prepare_integration_disconnect and the user's go-ahead.", destructive: true, access: "write", method: "PATCH", route: "/api/admin/integrations/[provider]/[id]", handler: integrationRoute.PATCH, input: { provider: Provider, id: IntegrationId, version: Version, challengeToken: z.string().min(16).max(500), confirmation: z.string().min(1).max(300) }, request: ({ version, challengeToken, confirmation }) => ({ body: { action: "disconnect", version, challengeToken, confirmation } }) }),

  // Operations
  routeTool({ name: "list_operations", title: "List operations", description: `Lists automations, sequences, broadcasts, contacts, tracked links, deliveries or webhook events across workspaces. Statuses by kind: ${describeByKind(adminOperationStatuses)}.`, access: "read", method: "GET", route: "/api/admin/operations/[kind]", handler: operationsRoute.GET, input: { kind: z.enum(adminOperationKinds), workspaceId: WorkspaceId.optional(), status: z.string().regex(/^[A-Z_]{2,40}$/).optional(), text: z.string().trim().min(1).max(120).optional(), provider: Provider.optional(), from: IsoDate.optional(), to: IsoDate.optional(), cursor: Cursor, limit: Limit } }),
  routeTool({ name: "get_operation", title: "Operation details", description: "One automation, sequence, broadcast, contact, tracked link, delivery or webhook event, with its version.", access: "read", method: "GET", route: "/api/admin/operations/[kind]/[id]", handler: operationRoute.GET, input: { kind: z.enum(adminOperationKinds), id: z.string().min(1).max(200) } }),
  routeTool({
    name: "run_operation_command", title: "Run operation command", destructive: true, openWorld: true, access: "write", method: "PATCH", route: "/api/admin/operations/[kind]/[id]", handler: operationRoute.PATCH,
    description: `Runs a command on one record. Actions by kind: ${describeByKind(adminOperationActions)}. input carries the fields some actions need: automation update {name?, definition?}, automation restore_version {versionNumber}, sequence update {name?}, contact update {leadStatus?, notes?, assigneeUserId?}, tracked_link update_destination {destination: https URL}. contact export_one returns CSV.`,
    input: { kind: z.enum(adminOperationKinds), id: z.string().min(1).max(200), action: z.enum(OPERATION_ACTIONS), version: Version, input: z.record(z.string(), z.unknown()).optional() },
    check: ({ kind, action }) => adminOperationActions[kind].includes(action) ? null : { path: "action", message: `${kind} accepts: ${adminOperationActions[kind].join(", ")}` },
  }),

  // Deletions and compliance
  routeTool({ name: "list_deletion_jobs", title: "List deletion jobs", description: "Permanent deletion jobs with their state and stages, newest first.", access: "read", method: "GET", route: "/api/admin/deletions", handler: deletionsRoute.GET, input: { cursor: Cursor } }),
  routeTool({ name: "get_deletion_job", title: "Deletion job details", description: "One deletion job: target, impact, state and each stage's progress.", access: "read", method: "GET", route: "/api/admin/deletions/[id]", handler: deletionJobRoute.GET, input: { id: z.string().min(1).max(128) } }),
  routeTool({ name: "preview_deletion", title: "Preview permanent deletion", description: "First step of permanently deleting a user or workspace: returns the impact (row counts, members, connections), its digest, the confirmation phrase and a challenge token for request_deletion. Nothing is deleted.", access: "write", method: "POST", route: "/api/admin/deletions/preview", handler: deletionPreviewRoute.POST, input: { target: DeletionTargetSchema } }),
  routeTool({ name: "request_deletion", title: "Permanently delete", description: "Permanently deletes the user or workspace previewed with preview_deletion. This cannot be undone. Needs the digest, phrase and token from the preview and the user's explicit go-ahead. includeAuthUsers also deletes the Supabase Auth accounts of a workspace's members.", destructive: true, access: "write", method: "POST", route: "/api/admin/deletions", handler: deletionsRoute.POST, input: { target: DeletionTargetSchema, impactDigest: z.string().length(64), confirmation: z.string().min(1).max(300), challengeToken: z.string().min(20).max(200), includeAuthUsers: z.boolean().default(false) } }),
  routeTool({ name: "change_deletion_job", destructive: true, title: "Cancel or retry deletion", description: "cancel stops a deletion job that has not finished; retry restarts a failed one.", access: "write", method: "PATCH", route: "/api/admin/deletions/[id]", handler: deletionJobRoute.PATCH, input: { id: z.string().min(1).max(128), action: z.enum(["cancel", "retry"]) } }),
  routeTool({ name: "preview_synthetic_cleanup", title: "Preview synthetic account cleanup", description: "First step of deleting the synthetic (test and review) accounts: returns how many, a digest, the confirmation phrase and a challenge token. Nothing is deleted.", access: "write", method: "POST", route: "/api/admin/deletions/synthetic/preview", handler: syntheticPreviewRoute.POST, input: {} }),
  routeTool({ name: "request_synthetic_cleanup", title: "Delete synthetic accounts", description: "Permanently deletes the synthetic accounts previewed with preview_synthetic_cleanup. Needs the digest, phrase and token and the user's explicit go-ahead.", destructive: true, access: "write", method: "POST", route: "/api/admin/deletions/synthetic", handler: syntheticRoute.POST, input: { impactDigest: z.string().length(64), confirmation: z.string().min(1).max(300), challengeToken: z.string().min(20).max(200) } }),
  routeTool({ name: "list_data_deletion_requests", title: "Meta data deletion requests", description: "The 100 most recent data deletion requests received from Meta, with status and completion time.", access: "read", method: "GET", route: "/api/admin/compliance/data-deletions", handler: dataDeletionsRoute.GET, input: { status: z.string().trim().min(1).max(40).optional() } }),

  // Audit
  routeTool({ name: "search_audit_log", title: "Search audit log", description: "Privileged admin events, newest first, with actor, action, target, reason, phase and before/after snapshots.", access: "read", method: "GET", route: "/api/admin/audit", handler: auditRoute.GET, input: { ...AUDIT_FILTERS, cursor: Cursor } }),
  routeTool({ name: "export_audit_log", title: "Export audit log", description: "Exports matching audit events as CSV (at most 10,000 rows). The export itself is audited.", access: "write", method: "POST", route: "/api/admin/audit/export", handler: auditExportRoute.POST, input: AUDIT_FILTERS }),
];

/** The tools for one MCP request; a read-only key is listed only the read tools. */
export function buildAdminMcpTools(incoming: Request, principal: AdminKeyPrincipal, dispatch: typeof callAdminRoute = callAdminRoute): McpTool[] {
  const context: ToolContext = { incoming, principal, dispatch };
  return adminMcpToolCatalog.map((spec) => {
    const allowed = principal.scope === "WRITE" || spec.access === "read";
    return {
      name: spec.name,
      title: spec.title,
      description: spec.description,
      access: spec.access,
      // A read-only key is not shown write tools; one called by name anyway
      // is told why it cannot run instead of "unknown tool".
      listed: allowed,
      inputSchema: spec.inputSchema,
      annotations: { readOnlyHint: spec.access === "read", destructiveHint: spec.destructive, idempotentHint: spec.access === "read", openWorldHint: spec.openWorld },
      async call(args: unknown) {
        if (!allowed) return READ_ONLY_REFUSAL;
        const parsed = spec.schema.safeParse(args);
        if (!parsed.success) return invalidArguments(parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
        return spec.run(parsed.data, context);
      },
    };
  });
}
