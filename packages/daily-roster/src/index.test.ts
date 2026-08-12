import { describe, expect, it } from "vitest";
import { canTransition } from "./index.js";
describe("operational day lifecycle", () => {
  it("permits only documented transitions", () => {
    expect(canTransition("draft", "ready")).toBe(true);
    expect(canTransition("draft", "locked")).toBe(false);
    expect(canTransition("locked", "ready")).toBe(true);
    expect(canTransition("archived", "draft")).toBe(false);
  });
});
