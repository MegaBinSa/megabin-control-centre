import { describe, expect, it, vi } from "vitest";
import { createRouteHandler, type RouteRpcClient } from "./routes-http.js";
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
});
