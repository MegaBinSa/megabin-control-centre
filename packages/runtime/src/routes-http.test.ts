import { describe, expect, it, vi } from "vitest";
import { createRouteHandler, type RouteRpcClient } from "./routes-http.js";
import { FakeOptimizationProvider, FakeRoutingProvider } from "@megabin/route-planning";
const request = (path: string, init: RequestInit = {}) =>
  new Request(`https://example.test/api/v1${path}`, init);
describe("route HTTP boundary", () => {
  it("requires authentication", async () => {
    const rpc = { rpc: vi.fn() } as unknown as RouteRpcClient;
    const r = await createRouteHandler({ rpc, actorId: null, id: () => "c" })(
      request("/route-plans")
    );
    expect(r?.status).toBe(401);
  });
  it("requires idempotency for generation", async () => {
    const rpc = { rpc: vi.fn() } as unknown as RouteRpcClient;
    const r = await createRouteHandler({ rpc, actorId: "a", id: () => "c" })(
      request("/route-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
    );
    expect(r?.status).toBe(400);
  });
  it("maps fixed generation endpoint to owning RPC", async () => {
    const rpc = {
      rpc: vi.fn().mockResolvedValue({ data: { route_version_id: "v" }, error: null })
    } as unknown as RouteRpcClient;
    const r = await createRouteHandler({ rpc, actorId: "a", id: () => "c" })(
      request("/route-plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "i" },
        body: JSON.stringify({ operationalDayId: "d" })
      })
    );
    expect(r?.status).toBe(201);
    expect(rpc.rpc).toHaveBeenCalledWith(
      "route_generate",
      expect.objectContaining({ p_operational_day_id: "d" })
    );
  });
  it("never exposes arbitrary RPC dispatch", async () => {
    const rpc = { rpc: vi.fn() } as unknown as RouteRpcClient;
    const r = await createRouteHandler({ rpc, actorId: "a", id: () => "c" })(
      request("/route-versions/v/arbitrary", {
        method: "POST",
        headers: { "Idempotency-Key": "i" }
      })
    );
    expect(r?.status).toBe(404);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
  it("runs the fake optimization through fixed owning boundaries", async () => {
    const routing = new FakeRoutingProvider();
    const rpc = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            route_optimization_attempt_id: "attempt",
            input_snapshot: {
              inputSignature: "signature",
              deterministicSeed: 1,
              vehicles: [],
              stops: []
            }
          },
          error: null
        })
        .mockResolvedValueOnce({ data: { lifecycle_status: "succeeded" }, error: null })
    } as unknown as RouteRpcClient;
    const response = await createRouteHandler({
      rpc,
      actorId: "actor",
      id: () => "correlation",
      routing,
      optimizer: new FakeOptimizationProvider(routing)
    })(
      request("/route-optimizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "key" },
        body: JSON.stringify({ sourceVersionId: "source", expectedUpdatedAt: "now" })
      })
    );
    expect(response?.status).toBe(202);
    expect(rpc.rpc).toHaveBeenNthCalledWith(2, "route_optimization_complete", expect.any(Object));
  });
  it("records an independently rejected provider result as a technical failure", async () => {
    const routing = new FakeRoutingProvider();
    const rpc = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            route_optimization_attempt_id: "attempt",
            input_snapshot: {
              inputSignature: "signature",
              deterministicSeed: 1,
              vehicles: [],
              stops: []
            }
          },
          error: null
        })
        .mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid" } })
        .mockResolvedValueOnce({ data: { lifecycle_status: "failed" }, error: null })
    } as unknown as RouteRpcClient;
    const response = await createRouteHandler({
      rpc,
      actorId: "actor",
      id: () => "correlation",
      routing,
      optimizer: new FakeOptimizationProvider(routing)
    })(
      request("/route-optimizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "key" },
        body: JSON.stringify({ sourceVersionId: "source", expectedUpdatedAt: "now" })
      })
    );
    expect(response?.status).toBe(202);
    expect(rpc.rpc).toHaveBeenNthCalledWith(
      3,
      "route_optimization_fail",
      expect.objectContaining({ p_classification: "invalid_response" })
    );
  });
  it("maps provider health to its fixed read endpoint", async () => {
    const rpc = {
      rpc: vi.fn().mockResolvedValue({ data: [{ health_status: "degraded" }], error: null })
    } as unknown as RouteRpcClient;
    const response = await createRouteHandler({ rpc, actorId: "actor", id: () => "c" })(
      request("/route-providers/health?serviceRegionId=region")
    );
    expect(response?.status).toBe(200);
    expect(rpc.rpc).toHaveBeenCalledWith(
      "route_provider_health",
      expect.objectContaining({ p_region_id: "region" })
    );
  });
});
