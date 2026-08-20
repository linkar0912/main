import type { FlowDefinition } from "./automation/types";
import { createId } from "./id";
import { createMemoryRepository } from "./memory-repository";
import type { AutomationRecord, AutomationRepository } from "./repository";

export const DEMO_WORKSPACE_ID = "demo_workspace";

const guideDefinition: FlowDefinition = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Here is your guide: https://example.com/guide" }],
};

const demoAutomations: AutomationRecord[] = [
  {
    id: "automation_guide",
    workspaceId: DEMO_WORKSPACE_ID,
    name: "Send the creator guide",
    status: "ACTIVE",
    version: 1,
    definition: guideDefinition,
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-20T08:30:00.000Z",
  },
  {
    id: "automation_price",
    workspaceId: DEMO_WORKSPACE_ID,
    name: "Answer pricing DMs",
    status: "PAUSED",
    version: 1,
    definition: {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_text", text: "Our starter plan begins at ₹499/month." }],
    },
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-19T13:00:00.000Z",
  },
];

export function createDemoRepository(): AutomationRepository {
  return createMemoryRepository(demoAutomations.map((automation) => ({ ...automation, id: createId(automation.id) })));
}
