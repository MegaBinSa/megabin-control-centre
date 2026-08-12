import { describe, expect, it } from "vitest";
import { canApplyRouteOperationAction } from "./index.js";

describe("route operation lifecycle", () => {
  it("allows only the implemented driver transitions", () => {
    expect(canApplyRouteOperationAction("available", "accept")).toBe(true);
    expect(canApplyRouteOperationAction("accepted", "start")).toBe(true);
    expect(canApplyRouteOperationAction("superseded", "start")).toBe(false);
    expect(canApplyRouteOperationAction("cancelled", "accept")).toBe(false);
  });
});
