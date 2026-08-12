import { describe, expect, it, vi } from "vitest";
import {
  createVehicleTrackingHandler,
  type VehicleTrackingRpcClient
} from "./vehicle-tracking-http.js";
const deviceId = "70000000-0000-4000-8000-000000000001";
const request = (path: string, init: RequestInit = {}) =>
  new Request(`https://example.test/api/v1${path}`, init);
describe("vehicle tracking HTTP boundary", () => {
  it("requires authentication", async () => {
    const rpc = { rpc: vi.fn() } as unknown as VehicleTrackingRpcClient;
    expect(
      (
        await createVehicleTrackingHandler({ rpc, actorId: null, id: () => "c" })(
          request("/driver/tracking/device")
        )
      )?.status
    ).toBe(401);
  });
  it("routes bounded batch ingestion", async () => {
    const rpc = {
      rpc: vi.fn().mockResolvedValue({ data: { receipts: [] }, error: null })
    } as unknown as VehicleTrackingRpcClient;
    const handler = createVehicleTrackingHandler({ rpc, actorId: "driver", id: () => "c" });
    const observations = [{ observationId: "71000000-0000-4000-8000-000000000001" }];
    const response = await handler(
      request("/driver/tracking/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "batch" },
        body: JSON.stringify({ deviceId, observations })
      })
    );
    expect(response?.status).toBe(200);
    expect(rpc.rpc).toHaveBeenCalledWith(
      "vehicle_tracking_ingest_batch",
      expect.objectContaining({ p_device_id: deviceId, p_observations: observations })
    );
  });
  it("rejects oversized batches before RPC", async () => {
    const rpc = { rpc: vi.fn() } as unknown as VehicleTrackingRpcClient;
    const response = await createVehicleTrackingHandler({ rpc, actorId: "driver", id: () => "c" })(
      request("/driver/tracking/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "batch" },
        body: JSON.stringify({ deviceId, observations: Array.from({ length: 101 }, () => ({})) })
      })
    );
    expect(response?.status).toBe(400);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
  it("does not expose arbitrary dispatch", async () => {
    const rpc = { rpc: vi.fn() } as unknown as VehicleTrackingRpcClient;
    const response = await createVehicleTrackingHandler({ rpc, actorId: "actor", id: () => "c" })(
      request("/vehicle-tracking/arbitrary")
    );
    expect(response?.status).toBe(404);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});
