import { describe, expect, it } from "vitest";
import { csvCell } from "./export";
describe("audit CSV", () => { it("neutralizes spreadsheet formulas", () => { expect(csvCell('=HYPERLINK("https://evil")')).toBe('"\'=HYPERLINK(""https://evil"")"'); }); });
