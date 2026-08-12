import { describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-empty-function -- unresolved promise simulates timeout */
import { FakeOptimizationProvider, FakeRoutingProvider } from "@megabin/route-planning";
import { runOptimization } from "./route-optimization.js";
const request = { inputSignature: "x", deterministicSeed: 1, vehicles: [], stops: [] };
describe("optimization reliability", () => {
  it("retries transient failures with a bound", async () => {
    const r = new FakeRoutingProvider(),
      result = await runOptimization(
        {
          routing: r,
          optimizer: new FakeOptimizationProvider(r, { failure: "retryable" }),
          timeoutMs: 100,
          maxRetries: 1
        },
        request
      );
    expect(result).toMatchObject({ ok: false, classification: "retryable" });
  });
  it("classifies timeouts safely", async () => {
    const r = new FakeRoutingProvider(),
      optimizer = {
        providerKey: "slow",
        adapterVersion: "1",
        health: () => r.health(),
        optimize: () => new Promise<never>(() => {})
      };
    const result = await runOptimization(
      { routing: r, optimizer, timeoutMs: 1, maxRetries: 0 },
      request
    );
    expect(result).toMatchObject({ ok: false, classification: "timeout" });
  });
});
