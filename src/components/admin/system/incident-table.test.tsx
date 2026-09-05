// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IncidentTable } from "./incident-table";

afterEach(cleanup);

describe("IncidentTable", () => {
  it("uses semantic rows and readable severity labels", () => {
    render(<IncidentTable incidents={[{
      id: "i_1", severity: "CRITICAL", status: "OPEN", source: "component:database",
      title: "Database unavailable", detail: "The bounded probe failed.",
      firstSeenAt: "2026-09-05T06:00:00Z", lastSeenAt: "2026-09-05T06:05:00Z",
      resolvedAt: null, occurrenceCount: 3,
    }]} now="2026-09-05T06:10:00Z" />);
    expect(screen.getByRole("table", { name: "Production incidents" })).toBeTruthy();
    expect(screen.getByRole("row", { name: /Critical Database unavailable/ })).toBeTruthy();
    expect(screen.getByText("10m active")).toBeTruthy();
  });
});
