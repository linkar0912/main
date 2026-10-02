import { expect, it } from "vitest";
import { formatAdminDate, formatAdminDateTime } from "./date-format";
it("renders explicit UTC dates independent of server and browser locales", () => {
  expect(formatAdminDateTime("2026-10-02T15:30:12+05:30")).toBe("2026-10-02 10:00:12 UTC");
  expect(formatAdminDate("2026-10-02T00:30:00+05:30")).toBe("2026-10-01");
  expect(formatAdminDateTime("invalid")).toBe("Unavailable");
});
