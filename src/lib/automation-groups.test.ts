import { describe, expect, it } from "vitest";
import { automationViewCounts, groupAutomations, matchesAutomationView, parseAutomationView, sortAutomations } from "./automation-groups";

const row = (id: string, status: string, extra: Partial<{ name: string; createdAt: string; updatedAt: string }> = {}) => ({
  id,
  status,
  name: extra.name ?? id,
  createdAt: extra.createdAt ?? "2026-10-01T00:00:00.000Z",
  updatedAt: extra.updatedAt ?? "2026-10-01T00:00:00.000Z",
});

describe("automation view tabs", () => {
  it("reads ?view= and falls back to All", () => {
    expect(parseAutomationView("live")).toBe("live");
    expect(parseAutomationView("drafts")).toBe("drafts");
    expect(parseAutomationView("paused")).toBe("paused");
    expect(parseAutomationView("ACTIVE")).toBe("all");
    expect(parseAutomationView(null)).toBe("all");
  });

  it("counts each tab by status", () => {
    const list = [row("a", "ACTIVE"), row("b", "ACTIVE"), row("c", "DRAFT"), row("d", "PAUSED")];
    expect(automationViewCounts(list)).toEqual({ all: 4, live: 2, drafts: 1, paused: 1 });
    expect(list.filter((item) => matchesAutomationView(item, "live")).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("groupAutomations", () => {
  const list = [row("live", "ACTIVE"), row("broken", "ACTIVE"), row("draft", "DRAFT"), row("paused", "PAUSED"), row("broken-paused", "PAUSED")];
  const broken = (item: { id: string }) => item.id.startsWith("broken");

  it("puts live automations with a problem first, then Live, Drafts and Paused", () => {
    const groups = groupAutomations(list, "all", broken);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Needs attention", ["broken"]],
      ["Live", ["live"]],
      ["Drafts", ["draft"]],
      ["Paused", ["paused", "broken-paused"]],
    ]);
  });

  it("drops empty groups", () => {
    expect(groupAutomations([row("a", "DRAFT")], "all", () => false).map((group) => group.key)).toEqual(["drafts"]);
  });

  it("narrows to the tab's status, keeping broken live ones pinned on the Live tab", () => {
    expect(groupAutomations(list, "live", broken).map((group) => group.key)).toEqual(["attention", "live"]);
    expect(groupAutomations(list, "paused", broken).map((group) => group.key)).toEqual(["paused"]);
  });
});

describe("sortAutomations", () => {
  const list = [
    row("b", "ACTIVE", { name: "beta", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z" }),
    row("a", "ACTIVE", { name: "Alpha", createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }),
    row("c", "ACTIVE", { name: "gamma", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z" }),
  ];

  it("sorts by last edit, name, age or replies", () => {
    expect(sortAutomations(list, "recent").map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(sortAutomations(list, "name").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(sortAutomations(list, "newest").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(sortAutomations(list, "replies", new Map([["a", 5], ["b", 40]])).map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("does not reorder the caller's array", () => {
    const copy = [...list];
    sortAutomations(list, "name");
    expect(list).toEqual(copy);
  });
});
