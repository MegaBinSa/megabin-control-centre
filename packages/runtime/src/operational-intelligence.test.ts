import { describe, expect, it } from "vitest";
import {
  evaluateOperationalIntelligence,
  type IntelligenceSnapshot
} from "./operational-intelligence.js";

const rules = {
  arrivalRadiusMetres: 75,
  departureRadiusMetres: 110,
  minimumDwellSeconds: 120,
  corridorToleranceMetres: 200,
  deviationMinimumObservations: 3,
  stationarySeconds: 600,
  stationaryRadiusMetres: 20,
  lateStartToleranceSeconds: 600,
  interStopDurationMultiplier: 2,
  outsideHoursGraceSeconds: 600,
  minimumAccuracyMetres: 100,
  completionToleranceSeconds: 600,
  ruleVersion: "phase-3c-v1"
};
const point = (
  id: string,
  minute: number,
  latitude = -25.75,
  longitude = 28.24,
  accuracyMetres = 10,
  speedMetresPerSecond = 0
) => ({
  observationId: id,
  recordedAt: `2026-08-12T08:${String(minute).padStart(2, "0")}:00Z`,
  latitude,
  longitude,
  accuracyMetres,
  speedMetresPerSecond
});
const snapshot = (patch: Partial<IntelligenceSnapshot> = {}): IntelligenceSnapshot => ({
  serviceRegionId: "51000000-0000-0000-0000-000000000001",
  vehicleId: "56000000-0000-0000-0000-000000000001",
  routeOperationId: "58000000-0000-0000-0000-000000000001",
  sourceRouteVersionId: "57000000-0000-0000-0000-000000000001",
  manifestRevision: 1,
  routeStatus: "in_progress",
  now: "2026-08-12T08:10:00Z",
  plannedStartAt: "2026-08-12T08:00:00Z",
  plannedEndAt: "2026-08-12T10:00:00Z",
  startedAt: "2026-08-12T08:00:00Z",
  trackingHealth: "healthy",
  points: [],
  stops: [
    {
      stopId: "59000000-0000-0000-0000-000000000001",
      sequence: 1,
      latitude: -25.75,
      longitude: 28.24
    }
  ],
  corridor: [{ latitude: -25.75, longitude: 28.24 }],
  insideExpectedArea: true,
  ...patch
});

describe("operational intelligence", () => {
  it("does not infer arrival from one noisy point", () => {
    const value = evaluateOperationalIntelligence(snapshot({ points: [point("noise", 1)] }), rules);
    expect(value.signals.map((item) => item.factType)).not.toContain("stop_arrival");
  });
  it("infers arrival and departure but authoritative outcomes drive progress", () => {
    const value = evaluateOperationalIntelligence(
      snapshot({
        points: [point("a", 0), point("b", 3), point("c", 5, -25.76, 28.25)],
        stops: [
          {
            stopId: "59000000-0000-0000-0000-000000000001",
            sequence: 1,
            latitude: -25.75,
            longitude: 28.24,
            authoritativeOutcome: "cleaned"
          },
          {
            stopId: "59000000-0000-0000-0000-000000000002",
            sequence: 2,
            latitude: -25.75,
            longitude: 28.24
          }
        ]
      }),
      rules
    );
    expect(value.progress.authoritativeCompletedStops).toBe(1);
    expect(value.signals.map((x) => x.factType)).toContain("stop_arrival");
    expect(value.signals.map((x) => x.factType)).toContain("stop_departure");
  });
  it("requires sustained good-quality evidence for deviation", () => {
    expect(
      evaluateOperationalIntelligence(
        snapshot({ points: [point("a", 1, -25.8, 28.3)] }),
        rules
      ).signals.map((x) => x.factType)
    ).not.toContain("route_deviation");
    expect(
      evaluateOperationalIntelligence(
        snapshot({
          points: [
            point("a", 1, -25.8, 28.3),
            point("b", 2, -25.8, 28.3),
            point("c", 3, -25.8, 28.3)
          ]
        }),
        rules
      ).signals.map((x) => x.factType)
    ).toContain("route_deviation");
    expect(
      evaluateOperationalIntelligence(
        snapshot({
          points: [
            point("a", 1, -25.8, 28.3, 500),
            point("b", 2, -25.8, 28.3, 500),
            point("c", 3, -25.8, 28.3, 500)
          ]
        }),
        rules
      ).signals.map((x) => x.factType)
    ).not.toContain("route_deviation");
  });
  it("resolves deviation on recovery", () => {
    const signal = evaluateOperationalIntelligence(
      snapshot({ existingOpenDeviation: true, points: [point("a", 1)] }),
      rules
    ).signals.find((x) => x.factType === "route_deviation");
    expect(signal?.status).toBe("resolved");
  });
  it("distinguishes expected dwell and unexpected stationary evidence", () => {
    expect(
      evaluateOperationalIntelligence(
        snapshot({ points: [point("a", 0), point("b", 3)] }),
        rules
      ).signals.map((x) => x.factType)
    ).not.toContain("unusual_stationary");
    expect(
      evaluateOperationalIntelligence(
        snapshot({
          points: [point("a", 0, -25.76, 28.25), point("b", 15, -25.76, 28.25)],
          stops: []
        }),
        rules
      ).signals.map((x) => x.factType)
    ).toContain("unusual_stationary");
  });
  it("derives timing, outside-hours, area, and completion classifications", () => {
    const value = evaluateOperationalIntelligence(
      snapshot({
        now: "2026-08-12T11:00:00Z",
        startedAt: undefined,
        completedAt: "2026-08-12T10:30:00Z",
        points: [
          point("a", 1, -25.8, 28.3, 10, 5),
          point("b", 2, -25.8, 28.3, 10, 5),
          point("c", 3, -25.8, 28.3, 10, 5)
        ],
        insideExpectedArea: false
      }),
      rules
    );
    expect(value.signals.map((x) => x.factType)).toEqual(
      expect.arrayContaining([
        "late_start",
        "outside_hours_movement",
        "unexpected_area",
        "completion_timing"
      ])
    );
  });
  it("classifies deterministic falling-behind risk", () => {
    const value = evaluateOperationalIntelligence(
      snapshot({
        now: "2026-08-12T09:50:00Z",
        stops: [
          { stopId: "a", sequence: 1, latitude: -25.75, longitude: 28.24 },
          { stopId: "b", sequence: 2, latitude: -25.75, longitude: 28.24 },
          { stopId: "c", sequence: 3, latitude: -25.75, longitude: 28.24 }
        ]
      }),
      rules
    );
    expect(value.progress.scheduleRisk).toBe("behind");
    expect(value.signals.map((item) => item.factType)).toContain("falling_behind");
  });
  it.each([
    ["2026-08-12T09:30:00Z", "early"],
    ["2026-08-12T10:05:00Z", "within_tolerance"],
    ["2026-08-12T10:30:00Z", "late"]
  ])("classifies completion at %s as %s", (completedAt, classification) => {
    const signal = evaluateOperationalIntelligence(snapshot({ completedAt }), rules).signals.find(
      (item) => item.factType === "completion_timing"
    );
    expect(signal?.evidence.classification).toBe(classification);
  });
});
