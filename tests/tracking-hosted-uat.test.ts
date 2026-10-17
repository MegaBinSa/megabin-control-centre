import { describe, expect, it, vi } from "vitest";
import { evaluateOperationalIntelligence } from "../packages/runtime/src/operational-intelligence.js";
import {
  completionEvaluation,
  runTrackingUat,
  trackingFixture,
  trackingWriteAllowed
} from "../scripts/tracking-hosted-uat.mjs";

describe("controlled hosted Tracking UAT", () => {
  it("rejects unconfirmed mutations before authentication", async () => {
    const fetcher = vi.fn();
    const result = await runTrackingUat(
      {
        EXPECTED_BUILD_SHA: "a".repeat(40),
        EXECUTE_TRACKING_FIXTURE: "true",
        CONFIRM_TRACKING_FIXTURE: "wrong"
      },
      fetcher
    );
    expect(result.outcome).toBe("Failed");
    expect(result.failedPhase).toBe("fixed_input");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("excludes route execution, finance and unrelated device/fact writes", () => {
    const device = "device-one",
      fact = "fact-one";
    expect(trackingWriteAllowed(`/vehicle-tracking/devices/${device}/assign`, device, fact)).toBe(
      true
    );
    expect(
      trackingWriteAllowed(`/operational-intelligence/facts/${fact}/resolve`, device, fact)
    ).toBe(true);
    for (const path of [
      "/driver/route-operations/anything/actions",
      "/route-operations/handoff",
      "/financial-eligibility/reevaluations",
      "/vehicle-tracking/devices/another/assign",
      "/operational-intelligence/facts/another/resolve"
    ])
      expect(trackingWriteAllowed(path, device, fact)).toBe(false);
  });
  it("classifies one historical completion without inventing GPS or Driver outcomes", () => {
    const operation = {
      routeOperationId: trackingFixture.operation,
      currentVehicleId: trackingFixture.vehicle,
      serviceRegionId: trackingFixture.region,
      publishedRouteVersionId: "f243e985-ea9c-46bc-9673-a9d6e07af6b4",
      lifecycleStatus: "completed",
      startedAt: "2026-08-24T06:13:40.758Z",
      completedAt: "2026-08-24T06:18:43.640Z",
      manifestRevision: 1,
      manifest: {
        manifestRevision: 1,
        plannedStartAt: "2026-08-24T05:00:00Z",
        plannedEndAt: "2026-08-24T13:00:00Z"
      }
    };
    const execution = {
      stops: [
        {
          routeOperationStopId: "2db1c8f2-1c78-4c51-83a9-91d89c34f98f",
          executionStatus: "completed",
          outcomeCode: "cleaned",
          actualDrumCount: 2,
          recordedBy: "aaa27c4a-040c-40d0-83d1-6a70d446c994",
          recordedAt: "2026-08-24T06:18:12.962Z"
        }
      ]
    };
    const before = structuredClone({ operation, execution });
    const { snapshot, rules } = completionEvaluation(operation, execution);
    const result = evaluateOperationalIntelligence(snapshot, rules);
    expect(result.signals.map((signal) => signal.factType)).toEqual(["completion_timing"]);
    expect(result.signals[0]?.evidence.classification).toBe("early");
    expect(snapshot.points).toEqual([]);
    expect(result.progress).toMatchObject({
      authoritativeCompletedStops: 1,
      inferredVisitedStops: 0,
      remainingStops: 0
    });
    expect({ operation, execution }).toEqual(before);
    expect(() =>
      completionEvaluation({ ...operation, lifecycleStatus: "in_progress" }, execution)
    ).toThrow();
    expect(() =>
      completionEvaluation(operation, {
        stops: [{ ...execution.stops[0], outcomeCode: "other_issue" }]
      })
    ).toThrow();
  });
});
