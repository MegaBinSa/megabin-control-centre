import { describe, expect, it } from "vitest";
import {
  alertWorthyOutcomes,
  canApplyRouteOperationAction,
  stopOutcomeValidation
} from "./index.js";

describe("route operation lifecycle", () => {
  it("allows only the implemented driver transitions", () => {
    expect(canApplyRouteOperationAction("available", "accept")).toBe(true);
    expect(canApplyRouteOperationAction("accepted", "start")).toBe(true);
    expect(canApplyRouteOperationAction("superseded", "start")).toBe(false);
    expect(canApplyRouteOperationAction("cancelled", "accept")).toBe(false);
  });
  it("enforces the field outcome contract", () => {
    expect(stopOutcomeValidation("cleaned", 2, null)).toBeNull();
    expect(stopOutcomeValidation("cleaned", -1, null)).toBe("actual_drum_count_required");
    expect(stopOutcomeValidation("drum_empty", null, null)).toBeNull();
    expect(stopOutcomeValidation("drum_missing", null, null)).toBe("reason_required");
    expect(alertWorthyOutcomes).toEqual(["could_not_access", "drum_missing", "other_issue"]);
  });
});
