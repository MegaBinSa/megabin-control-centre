import { describe, expect, it, vi } from "vitest";
import {
  createRouteOperationsHandler,
  type RouteOperationsRpcClient
} from "./route-operations-http.js";

const operationId = "10000000-0000-4000-8000-000000000001";
const request = (path: string, init: RequestInit = {}) =>
  new Request(`https://example.test/api/v1${path}`, init);

describe("route operations HTTP boundary", () => {
  it("requires authentication and write idempotency", async () => {
    const rpc = { rpc: vi.fn() } as unknown as RouteOperationsRpcClient;
    expect(
      (
        await createRouteOperationsHandler({ rpc, actorId: null, id: () => "c" })(
          request("/driver/route-operations")
        )
      )?.status
    ).toBe(401);
    expect(
      (
        await createRouteOperationsHandler({ rpc, actorId: "actor", id: () => "c" })(
          request("/route-operations/handoff", { method: "POST", body: "{}" })
        )
      )?.status
    ).toBe(400);
  });

  it("maps published handoff and reassignment to fixed owning RPCs", async () => {
    const rpc = {
      rpc: vi.fn().mockResolvedValue({ data: { route_operation_id: operationId }, error: null })
    } as unknown as RouteOperationsRpcClient;
    const handler = createRouteOperationsHandler({ rpc, actorId: "actor", id: () => "c" });
    const handoff = await handler(
      request("/route-operations/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "one" },
        body: JSON.stringify({ publishedRouteVersionId: "version" })
      })
    );
    expect(handoff?.status).toBe(201);
    expect(rpc.rpc).toHaveBeenCalledWith(
      "route_operations_handoff",
      expect.objectContaining({ p_published_route_version_id: "version" })
    );
    await handler(
      request(`/route-operations/${operationId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "two" },
        body: JSON.stringify({
          expectedAssignmentRevision: 1,
          teamId: "team",
          vehicleId: "vehicle",
          staffIds: ["staff"],
          reason: "Cover"
        })
      })
    );
    expect(rpc.rpc).toHaveBeenLastCalledWith(
      "route_operation_reassign",
      expect.objectContaining({ p_expected_assignment_revision: 1, p_reason: "Cover" })
    );
  });

  it("keeps offline and HTTP idempotency identities identical", async () => {
    const rpc = {
      rpc: vi.fn().mockResolvedValue({ data: { outcome: "accepted" }, error: null })
    } as unknown as RouteOperationsRpcClient;
    const handler = createRouteOperationsHandler({ rpc, actorId: "driver", id: () => "c" });
    const action = {
      actionId: "20000000-0000-4000-8000-000000000001",
      routeOperationId: operationId,
      assignmentRevision: 1,
      deviceTimestamp: new Date().toISOString(),
      clientSequence: 1,
      idempotencyKey: "offline-key",
      correlationId: "30000000-0000-4000-8000-000000000001",
      actionType: "accept",
      payloadVersion: 1,
      payload: {}
    };
    const rejected = await handler(
      request(`/driver/route-operations/${operationId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "different" },
        body: JSON.stringify(action)
      })
    );
    expect(rejected?.status).toBe(400);
    expect(rpc.rpc).not.toHaveBeenCalled();
    const accepted = await handler(
      request(`/driver/route-operations/${operationId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "offline-key" },
        body: JSON.stringify(action)
      })
    );
    expect(accepted?.status).toBe(200);
    expect(rpc.rpc).toHaveBeenCalledWith(
      "driver_route_operation_action",
      expect.objectContaining({ p_action: action })
    );
  });

  it("does not expose arbitrary RPC dispatch", async () => {
    const rpc = { rpc: vi.fn() } as unknown as RouteOperationsRpcClient;
    const response = await createRouteOperationsHandler({
      rpc,
      actorId: "actor",
      id: () => "c"
    })(request(`/route-operations/${operationId}/arbitrary`));
    expect(response?.status).toBe(404);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});
