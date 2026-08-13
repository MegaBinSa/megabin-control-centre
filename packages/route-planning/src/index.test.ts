import { describe, expect, it } from "vitest";
import { routeVersionEditable, unassignedReasonCodes } from "./index.js";
describe("route planning domain", () => {
  it("only permits Draft edits", () => {
    expect(routeVersionEditable("draft")).toBe(true);
    expect(routeVersionEditable("published")).toBe(false);
  });
  it("keeps unassigned explanations explicit", () => {
    expect(unassignedReasonCodes).toContain("capacity_exceeded");
    expect(unassignedReasonCodes).toContain("missing_coordinates");
    expect(unassignedReasonCodes).toContain("financial_hold");
  });
});
