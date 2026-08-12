import { describe, expect, it, vi } from "vitest";
import { createLiveOperationsHandler } from "./live-operations-http.js";
const actor = "61000000-0000-4000-8000-000000000001";
describe("live operations HTTP", () => {
  it("requires authentication", async () => {
    const handler = createLiveOperationsHandler({
      actorId: null,
      id: () => "c",
      rpc: { rpc: vi.fn() }
    });
    expect((await handler(new Request("https://test/api/v1/live-operations")))?.status).toBe(401);
  });
  it("routes fixed regional overview", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { routes: [] }, error: null });
    const handler = createLiveOperationsHandler({ actorId: actor, id: () => "c", rpc: { rpc } });
    expect(
      (await handler(new Request("https://test/api/v1/live-operations?serviceRegionId=r")))?.status
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith("live_operations_overview", {
      p_actor_id: actor,
      p_region_id: "r"
    });
  });
  it("denies arbitrary routes", async () => {
    const handler = createLiveOperationsHandler({
      actorId: actor,
      id: () => "c",
      rpc: { rpc: vi.fn() }
    });
    expect(
      (await handler(new Request("https://test/api/v1/live-operations/raw-sql")))?.status
    ).toBe(404);
  });
  it("defers bounded inference application", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    let work: Promise<unknown> | undefined;
    const handler = createLiveOperationsHandler({
      actorId: actor,
      id: () => "c",
      rpc: { rpc },
      defer: (pending) => {
        work = pending;
      }
    });
    const response = await handler(
      new Request("https://test/api/v1/operational-intelligence/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "job-1" },
        body: JSON.stringify({
          snapshot: {
            serviceRegionId: "r",
            vehicleId: "v",
            routeOperationId: "o",
            sourceRouteVersionId: "rv",
            manifestRevision: 1,
            routeStatus: "in_progress",
            now: "2026-08-12T08:00:00Z",
            plannedStartAt: "2026-08-12T08:00:00Z",
            plannedEndAt: "2026-08-12T10:00:00Z",
            trackingHealth: "healthy",
            points: [],
            stops: []
          },
          rules: {
            arrivalRadiusMetres: 75,
            departureRadiusMetres: 110,
            minimumDwellSeconds: 120,
            corridorToleranceMetres: 250,
            deviationMinimumObservations: 3,
            stationarySeconds: 900,
            stationaryRadiusMetres: 25,
            lateStartToleranceSeconds: 600,
            interStopDurationMultiplier: 2,
            outsideHoursGraceSeconds: 900,
            minimumAccuracyMetres: 100,
            completionToleranceSeconds: 900,
            ruleVersion: "phase-3c-v1"
          }
        })
      })
    );
    expect(response?.status).toBe(202);
    await work;
    expect(rpc).toHaveBeenCalledWith(
      "operational_intelligence_apply",
      expect.objectContaining({ p_region_id: "r" })
    );
  });
});
