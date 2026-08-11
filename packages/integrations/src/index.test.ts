import { describe, expect, it } from "vitest";

import { executeWithAdapter, FakeIntegrationAdapter, type IntegrationAdapter } from "./index.js";

describe("integration adapter boundary", () => {
  it("uses a fake adapter through the provider-neutral interface", async () => {
    const first: IntegrationAdapter<{ value: string }, { providerValue: string }> =
      new FakeIntegrationAdapter(
        {
          integrationId: "fake-one",
          provider: "fake",
          capability: "platform-proof",
          environment: "local",
          mode: "capture"
        },
        { providerValue: "first" }
      );
    const replacement: IntegrationAdapter<{ value: string }, { providerValue: string }> =
      new FakeIntegrationAdapter(
        {
          integrationId: "fake-two",
          provider: "fake",
          capability: "platform-proof",
          environment: "local",
          mode: "test"
        },
        { providerValue: "replacement" }
      );
    const context = { correlationId: "correlation-1", idempotencyKey: "action-1" };

    await expect(executeWithAdapter(first, { value: "request" }, context)).resolves.toEqual({
      ok: true,
      value: { providerValue: "first" }
    });
    await expect(executeWithAdapter(replacement, { value: "request" }, context)).resolves.toEqual({
      ok: true,
      value: { providerValue: "replacement" }
    });
  });

  it("prevents the fake adapter from masquerading as a live provider", () => {
    expect(
      () =>
        new FakeIntegrationAdapter(
          {
            integrationId: "unsafe",
            provider: "fake",
            capability: "platform-proof",
            environment: "production",
            mode: "live"
          },
          {}
        )
    ).toThrow("cannot operate in live mode");
  });
});
