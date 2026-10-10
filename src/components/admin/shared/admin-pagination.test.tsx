// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminPagination, parseAdminPageHistory } from "./admin-pagination";

afterEach(cleanup);

function href(name: string): URL {
  return new URL(screen.getByRole("link", { name }).getAttribute("href")!, "https://admin.linkar.in");
}

describe("AdminPagination", () => {
  it("offers only Next on the first page", () => {
    render(<AdminPagination basePath="/admin/users" params={{ search: "acme" }} cursor={null} history={[]} nextCursor="c2" label="User pagination" summary="Users" />);
    expect(screen.queryByRole("link", { name: /Previous page/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /First page/ })).toBeNull();
    const next = href("Next page");
    expect(next.searchParams.get("cursor")).toBe("c2");
    expect(next.searchParams.get("search")).toBe("acme");
    expect(next.searchParams.has("prev")).toBe(false);
  });

  it("carries visited cursors so Previous and First can walk back", () => {
    render(<AdminPagination basePath="/admin/workspaces" params={{ cursor: "stale", prev: "stale" }} cursor="c3" history={["c2"]} nextCursor="c4" label="Workspace pagination" summary="Workspaces" />);
    const next = href("Next page");
    expect(next.searchParams.get("cursor")).toBe("c4");
    expect(next.searchParams.get("prev")).toBe("c2,c3");
    const previous = href("Previous page");
    expect(previous.searchParams.get("cursor")).toBe("c2");
    expect(previous.searchParams.has("prev")).toBe(false);
    expect(href("First page").pathname + href("First page").search).toBe("/admin/workspaces");
  });

  it("returns to the first page from page two and ends cleanly", () => {
    render(<AdminPagination basePath="/admin/audit" params={{ phase: "FAILURE" }} cursor="c2" history={[]} nextCursor={null} label="Audit pagination" summary="Events" />);
    expect(href("Previous page").search).toBe("?phase=FAILURE");
    expect(screen.getByText("End of results")).toBeTruthy();
  });

  it("parses and bounds the history parameter", () => {
    expect(parseAdminPageHistory(undefined)).toEqual([]);
    expect(parseAdminPageHistory(["a"])).toEqual([]);
    expect(parseAdminPageHistory("a,,b")).toEqual(["a", "b"]);
    expect(parseAdminPageHistory(Array.from({ length: 30 }, (_, index) => `c${index}`).join(","))).toHaveLength(20);
  });
});
