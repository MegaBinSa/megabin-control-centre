import { afterEach, describe, expect, it, vi } from "vitest";
/* eslint-disable @typescript-eslint/no-empty-function -- unresolved promise simulates timeout */
import { FakeOptimizationProvider, FakeRoutingProvider } from "@megabin/route-planning";
import { runOptimization } from "./route-optimization.js";
const request = { inputSignature: "x", deterministicSeed: 1, vehicles: [], stops: [] };
describe("optimization reliability", () => {
  afterEach(() => vi.useRealTimers());
  it("retries transient failures with a bound", async () => {
    const r = new FakeRoutingProvider(),
      result = await runOptimization(
        {
          routing: r,
          optimizer: new FakeOptimizationProvider(r, { failure: "retryable" }),
          timeoutMs: 100,
          maxRetries: 1,
          maxRetryAfterMs: 5
        },
        request
      );
    expect(result).toMatchObject({ ok: false, classification: "retryable" });
  });
  it("bounds provider retry-after hints", async () => {
    vi.useFakeTimers();
    const r = new FakeRoutingProvider(),
      optimize = vi.fn().mockResolvedValue({
        ok: false as const,
        classification: "rate_limited" as const,
        safeMessage: "Synthetic rate limit.",
        retryAfterMs: 60_000
      }),
      execution = runOptimization(
        {
          routing: r,
          optimizer: {
            providerKey: "rate-limited",
            adapterVersion: "1",
            health: () => r.health(),
            optimize
          },
          timeoutMs: 100,
          maxRetries: 1,
          maxRetryAfterMs: 10
        },
        request
      );
    await vi.advanceTimersByTimeAsync(9);
    expect(optimize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await execution;
    expect(result).toMatchObject({ ok: false, classification: "rate_limited" });
    expect(optimize).toHaveBeenCalledTimes(2);
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
