import { describe, expect, it } from "vitest";

import {
  API_BASE_PATH,
  buildIdempotentRequestHeaders,
  CORRELATION_ID_HEADER,
  IDEMPOTENCY_KEY_HEADER
} from "./index.js";

describe("API foundation", () => {
  it("starts all application endpoints at the versioned base path", () => {
    expect(API_BASE_PATH).toBe("/api/v1");
  });

  it("builds the required retry-safe request headers", () => {
    expect(
      buildIdempotentRequestHeaders({
        idempotencyKey: "action-123",
        correlationId: "00000000-0000-0000-0000-000000000001"
      })
    ).toEqual({
      [IDEMPOTENCY_KEY_HEADER]: "action-123",
      [CORRELATION_ID_HEADER]: "00000000-0000-0000-0000-000000000001"
    });
  });

  it("rejects an empty idempotency key", () => {
    expect(() =>
      buildIdempotentRequestHeaders({ idempotencyKey: " ", correlationId: "correlation" })
    ).toThrow("idempotency key");
  });
});
