// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  adminPages,
  filterItems,
  groupBySection,
  isPaletteShortcut,
  isTypingTarget,
  matchScore,
  moveActive,
  readRecent,
  rememberRecent,
  RECENT_LIMIT,
  workspaceActions,
  workspacePages,
  type PaletteItem,
} from "./command-palette-items";
import { automationItem, contactItem, conversationItem } from "./command-palette-sources";

const item = (label: string, extra: Partial<PaletteItem> = {}): PaletteItem => ({ id: `page:${label}`, section: "Pages", kind: "page", label, href: `/${label}`, ...extra });

describe("palette matching", () => {
  it("needs every word of the query and prefers labels that start with it", () => {
    const items = [item("Delivery", { keywords: "messaging hours" }), item("Help"), item("Billing", { hint: "Settings", keywords: "plan payment" })];
    expect(filterItems(items, "plan").map((entry) => entry.label)).toEqual(["Billing"]);
    expect(filterItems(items, "settings bill").map((entry) => entry.label)).toEqual(["Billing"]);
    expect(filterItems(items, "zzz")).toEqual([]);
    expect(matchScore(item("Insights"), "ins")).toBeLessThan(matchScore(item("Quick insights tour"), "ins"));
    expect(matchScore(item("Contacts"), "contacts")).toBe(0);
  });

  it("ignores case, accents and the @ of a handle", () => {
    expect(matchScore(item("@Café.Studio"), "cafe")).toBeGreaterThanOrEqual(0);
    expect(matchScore(item("@meera.styles"), "meera")).toBe(1);
  });

  it("keeps the original order on ties and honours the limit", () => {
    const items = [item("Alpha one"), item("Alpha two"), item("Alpha three")];
    expect(filterItems(items, "alpha", 2).map((entry) => entry.label)).toEqual(["Alpha one", "Alpha two"]);
  });

  it("groups by section in first-seen order", () => {
    const groups = groupBySection([item("A"), { ...item("B"), section: "Actions" }, item("C")]);
    expect(groups.map((group) => [group.section, group.items.length])).toEqual([["Pages", 2], ["Actions", 1]]);
  });
});

describe("palette keyboard", () => {
  it("wraps arrow keys and jumps with Home/End", () => {
    expect(moveActive(-1, 3, "ArrowDown")).toBe(0);
    expect(moveActive(2, 3, "ArrowDown")).toBe(0);
    expect(moveActive(0, 3, "ArrowUp")).toBe(2);
    expect(moveActive(1, 3, "End")).toBe(2);
    expect(moveActive(1, 3, "Home")).toBe(0);
    expect(moveActive(0, 0, "ArrowDown")).toBe(-1);
  });

  it("opens on ⌘K / Ctrl K anywhere and on / outside text fields", () => {
    const input = document.createElement("input");
    const checkbox = Object.assign(document.createElement("input"), { type: "checkbox" });
    const textarea = document.createElement("textarea");
    const key = (init: Partial<KeyboardEvent>) => ({ key: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: document.body, isComposing: false, ...init }) as KeyboardEvent;
    expect(isPaletteShortcut(key({ key: "k", metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key({ key: "K", ctrlKey: true, target: input }))).toBe(true);
    expect(isPaletteShortcut(key({ key: "/" }))).toBe(true);
    expect(isPaletteShortcut(key({ key: "/", target: input }))).toBe(false);
    expect(isPaletteShortcut(key({ key: "/", target: textarea }))).toBe(false);
    expect(isPaletteShortcut(key({ key: "/", target: checkbox }))).toBe(true);
    expect(isPaletteShortcut(key({ key: "k" }))).toBe(false);
    expect(isPaletteShortcut(key({ key: "k", metaKey: true, isComposing: true }))).toBe(false);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });
});

describe("recent picks", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps the newest five, without duplicates, under Recent", () => {
    for (const label of ["One", "Two", "Three", "Four", "Five", "Six", "Two"]) rememberRecent("test.recent", item(label));
    const recent = readRecent("test.recent");
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent.map((entry) => entry.label)).toEqual(["Two", "Six", "Five", "Four", "Three"]);
    expect(recent.every((entry) => entry.section === "Recent")).toBe(true);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("test.recent", "{not json");
    expect(readRecent("test.recent")).toEqual([]);
    window.localStorage.setItem("test.recent", JSON.stringify([{ id: 1 }, { id: "x", label: "No target" }]));
    expect(readRecent("test.recent")).toEqual([]);
  });
});

describe("palette contents", () => {
  it("lists every workspace destination and Settings section, and the owner console only for owners", () => {
    const hrefs = workspacePages().map((page) => page.href);
    for (const href of ["/dashboard", "/activity", "/contacts", "/automations", "/quick-automation", "/insights", "/settings", "/settings?section=billing", "/help"]) {
      expect(hrefs).toContain(href);
    }
    expect(hrefs).not.toContain("/admin");
    expect(workspacePages({ platformOwner: true }).map((page) => page.href)).toContain("/admin");
  });

  it("offers the + menu items plus connecting accounts and exporting contacts", () => {
    const labels = workspaceActions().map((action) => action.label);
    expect(labels).toEqual(expect.arrayContaining(["New automation", "Quick automation", "From a template", "New tracked link", "New broadcast", "Connect Instagram", "Export contacts"]));
    expect(workspaceActions().find((action) => action.label === "Connect Instagram")?.external).toBe(true);
  });

  it("gives the owner console its own pages", () => {
    expect(adminPages().map((page) => page.label)).toEqual(expect.arrayContaining(["Overview", "Workspaces", "Users", "Audit log", "Back to workspace"]));
  });

  it("turns API rows into plain-language results", () => {
    expect(automationItem({ id: "a1", name: "Price reply", status: "ACTIVE", provider: "INSTAGRAM" })).toMatchObject({ label: "Price reply", hint: "Live · Instagram", href: "/automations/a1/edit" });
    expect(contactItem({ id: "c1", instagramUsername: "meera.styles", leadStatus: "CUSTOMER" })).toMatchObject({ label: "@meera.styles", hint: "Customer", href: "/contacts?q=meera.styles" });
    expect(contactItem({ id: "c2" })).toBeNull();
    expect(conversationItem({ id: "c1", username: "meera.styles", preview: "Is this in stock?" })).toMatchObject({ label: "@meera.styles", hint: "Is this in stock?", href: "/activity?contact=c1" });
  });
});
