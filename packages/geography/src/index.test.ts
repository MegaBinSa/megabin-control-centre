import { describe, expect, it } from "vitest";
import { positions, type TerritoryGeometry } from "./index.js";

describe("provider-neutral geography contracts", () => {
  it("flattens polygon and multipolygon positions without provider types", () => {
    const multi: TerritoryGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [28, -26],
            [29, -26],
            [28, -26]
          ]
        ]
      ]
    };
    expect(positions(multi)).toEqual([
      [28, -26],
      [29, -26],
      [28, -26]
    ]);
  });
});
