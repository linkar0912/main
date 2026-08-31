// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { PlansScreen } = await import("./plans-screen"); afterEach(cleanup);
const plan = { id: "p1", key: "growth", name: "Growth", isActive: true, version: 2, workspaceCount: 7, memberLimit: null, automationLimit: 20, instagramConnectionLimit: 2, facebookConnectionLimit: 2, sequenceLimit: 10, monthlyBroadcastLimit: 5, monthlyDeliveryLimit: 1000, sequencesEnabled: true, broadcastsEnabled: true, trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true };
describe("PlansScreen", () => { it("renders nullable limits, assignments, features, and retirement", () => { render(<PlansScreen plans={[plan]} />); expect(screen.getByText("7 assigned workspaces · Active")).toBeTruthy(); expect(screen.getAllByLabelText("Members").some((input) => (input as HTMLInputElement).value === "")).toBe(true); expect(screen.getByRole("button", { name: "Retire plan" })).toBeTruthy(); expect(screen.getByRole("checkbox", { name: "Exports", checked: true })).toBeTruthy(); }); });
