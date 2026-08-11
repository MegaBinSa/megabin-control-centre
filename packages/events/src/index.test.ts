import { describe, expect, it } from "vitest";

import { assertDomainEventContract, type DomainEvent } from "./index.js";

const validEvent: DomainEvent = {
  eventId: "00000000-0000-0000-0000-000000000001",
  name: "Platform.FoundationProved",
  version: 1,
  producer: "system-health",
  aggregate: {
    type: "platform-proof",
    id: "00000000-0000-0000-0000-000000000002"
  },
  occurredAt: "2026-08-11T00:00:00.000Z",
  correlationId: "00000000-0000-0000-0000-000000000003",
  payload: {}
};

describe("assertDomainEventContract", () => {
  it("accepts the shared event envelope", () => {
    expect(() => assertDomainEventContract(validEvent)).not.toThrow();
  });

  it("rejects versions that cannot be evolved safely", () => {
    expect(() => assertDomainEventContract({ ...validEvent, version: 0 })).toThrow(
      "positive integers"
    );
  });

  it("rejects unstable event-name formatting", () => {
    expect(() =>
      assertDomainEventContract({ ...validEvent, name: "platform.foundation-proved.v1" })
    ).toThrow("PascalCase segments");
  });
});
