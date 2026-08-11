import { describe, expect, it } from "vitest";

import { createChildTrace, createLogRecord } from "./index.js";

describe("observability contracts", () => {
  it("propagates correlation identity across layers", () => {
    const api = { correlationId: "correlation-1", requestId: "request-1" };
    const application = createChildTrace(api, { causationId: "request-1" });
    const outbox = createChildTrace(application, {
      causationId: "command-1",
      eventId: "event-1"
    });

    expect(application.correlationId).toBe("correlation-1");
    expect(outbox.correlationId).toBe("correlation-1");
  });

  it("redacts nested secret and PII metadata", () => {
    const record = createLogRecord({
      timestamp: "2026-08-11T00:00:00.000Z",
      level: "error",
      message: "Adapter failed",
      trace: { correlationId: "correlation-1" },
      runtime: { environment: "staging", service: "control-centre", buildId: "build-1" },
      metadata: { provider: "fake", authorization: "Bearer unsafe", contact: { email: "x@y" } }
    });

    expect(record.metadata).toEqual({
      provider: "fake",
      authorization: "[REDACTED]",
      contact: { email: "[REDACTED]" }
    });
  });
});
