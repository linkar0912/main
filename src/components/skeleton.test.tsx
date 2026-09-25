// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ActivityContentSkeleton,
  AdminDetailSkeleton,
  AdminOverviewSkeleton,
  AdminTableSkeleton,
  AutomationsSkeleton,
  ContactsContentSkeleton,
  InsightsContentSkeleton,
  InlineContentSkeleton,
  ScreenSkeleton,
} from "./skeleton";

describe("ScreenSkeleton", () => {
  afterEach(cleanup);

  it("renders inside the persistent app shell without duplicating navigation", () => {
    const { container } = render(<ScreenSkeleton />);

    expect(container.querySelector(".app-frame, .sidebar, .mobile-topbar")).toBeNull();
    expect(screen.getByLabelText("Loading workspace")).toBeTruthy();
  });

  it("matches the Insights metric, chart, and lower-detail structure", () => {
    const { container } = render(<InsightsContentSkeleton />);

    expect(screen.getByLabelText("Loading insights data").getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll(".skeleton-metric")).toHaveLength(4);
    expect(container.querySelector(".skeleton-chart")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-detail-panel")).toHaveLength(2);
  });

  it("provides content-only loaders that match the Inbox desk and Contacts rows", () => {
    const { container, rerender } = render(<ActivityContentSkeleton />);
    expect(screen.getByLabelText("Loading inbox activity")).toBeTruthy();
    expect(container.querySelector(".conversation-desk-loading .conversation-roster")).toBeTruthy();
    expect(container.querySelector(".conversation-desk-loading .conversation-panel")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-list-row").length).toBeGreaterThanOrEqual(4);

    rerender(<ContactsContentSkeleton />);
    expect(screen.getByLabelText("Loading contacts")).toBeTruthy();
    expect(container.querySelector(".skeleton-toolbar")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-list-row").length).toBeGreaterThanOrEqual(4);
  });

  it("uses quiet grouped rows instead of decorative separators", () => {
    const { container } = render(<AutomationsSkeleton />);
    expect(container.querySelector(".skeleton-row-bordered")).toBeNull();
    expect(container.querySelectorAll(".skeleton-list-row").length).toBeGreaterThanOrEqual(4);
  });

  it("offers page-shaped admin overview, table, and detail loaders", () => {
    const { container, rerender } = render(<AdminOverviewSkeleton />);
    expect(screen.getByLabelText("Loading admin overview")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-metric")).toHaveLength(4);

    rerender(<AdminTableSkeleton />);
    expect(screen.getByLabelText("Loading admin table")).toBeTruthy();
    expect(container.querySelector(".skeleton-toolbar")).toBeTruthy();

    rerender(<AdminDetailSkeleton />);
    expect(screen.getByLabelText("Loading admin details")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-detail-panel")).toHaveLength(2);
  });

  it("provides a compact shared loader for panels and dialogs", () => {
    const { container } = render(<InlineContentSkeleton label="Loading contact details" rows={3} />);

    expect(screen.getByLabelText("Loading contact details")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-list-row")).toHaveLength(3);
  });
});
