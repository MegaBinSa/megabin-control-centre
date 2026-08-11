import { describe, expect, it } from "vitest";

import { classifyOfflineRetry } from "./offline.js";

describe("offline action retry classification", () => {
  it("accepts an unseen action", () => {
    expect(classifyOfflineRetry(undefined, "fingerprint-a")).toBe("accepted");
  });

  it("classifies an identical retry as a duplicate", () => {
    expect(classifyOfflineRetry("fingerprint-a", "fingerprint-a")).toBe("duplicate");
  });

  it("classifies reused identity with different content as a conflict", () => {
    expect(classifyOfflineRetry("fingerprint-a", "fingerprint-b")).toBe("conflict");
  });
});
