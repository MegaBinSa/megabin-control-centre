import { describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-non-null-assertion -- fixed fixtures assert their shape */
import { FakeOptimizationProvider, FakeRoutingProvider } from "./providers.js";
const points = [
  { latitude: -25.75, longitude: 28.2 },
  { latitude: -25.76, longitude: 28.22 }
];
describe("provider-neutral routing", () => {
  it("returns deterministic matrix and road geometry", async () => {
    const p = new FakeRoutingProvider(),
      a = await p.matrix(points),
      b = await p.matrix(points);
    expect(a).toEqual(b);
    const r = await p.route({ points, mode: "static_road" });
    expect(r.ok && r.value.geometry.source).toBe("provider_road");
  });
  it("supports replacement and safe failure classification", async () => {
    const a = await new FakeRoutingProvider({ distanceFactor: 1 }).matrix(points),
      b = await new FakeRoutingProvider({ distanceFactor: 2 }).matrix(points);
    expect(a.ok && b.ok && a.value.estimates[0]![1]!.distanceMetres).not.toBe(
      b.ok && b.value.estimates[0]![1]!.distanceMetres
    );
    expect(await new FakeRoutingProvider({ failure: "rate_limited" }).matrix(points)).toMatchObject(
      { ok: false, classification: "rate_limited" }
    );
  });
  it("surfaces degraded provider health without changing route data", async () => {
    const health = await new FakeRoutingProvider({ health: "degraded" }).health();
    expect(health.status).toBe("degraded");
  });
});
describe("provider-neutral optimization", () => {
  it("respects eligibility, capacity and windows deterministically", async () => {
    const routing = new FakeRoutingProvider(),
      p = new FakeOptimizationProvider(routing),
      request = {
        inputSignature: "x",
        deterministicSeed: 1,
        vehicles: [
          {
            routeId: "r1",
            teamId: "t1",
            capacityUnits: 2,
            usableWindowMinutes: 20,
            start: points[0]!,
            end: points[0]!
          },
          {
            routeId: "r2",
            teamId: "t2",
            capacityUnits: 4,
            usableWindowMinutes: 60,
            start: points[0]!,
            end: points[0]!
          }
        ],
        stops: [
          {
            stopId: "s2",
            eligibleRouteIds: ["r1"],
            point: points[1]!,
            capacityUnits: 3,
            serviceDurationMinutes: 10
          },
          {
            stopId: "s1",
            eligibleRouteIds: ["r2"],
            point: points[1]!,
            capacityUnits: 2,
            serviceDurationMinutes: 10
          }
        ]
      };
    const a = await p.optimize(request),
      b = await p.optimize(request);
    expect(a).toEqual(b);
    expect(a.ok && a.value.routes[1]!.stopIds).toEqual(["s1"]);
    expect(a.ok && a.value.unassignedStopIds).toEqual(["s2"]);
  });
  it("supports optimizer replacement without provider types entering the request", async () => {
    const request = {
      inputSignature: "same-input",
      deterministicSeed: 7,
      vehicles: [
        {
          routeId: "r",
          teamId: "t",
          capacityUnits: 10,
          usableWindowMinutes: 240,
          start: points[0]!,
          end: points[0]!
        }
      ],
      stops: [
        {
          stopId: "s",
          eligibleRouteIds: ["r"],
          point: points[1]!,
          capacityUnits: 1,
          serviceDurationMinutes: 5
        }
      ]
    };
    const first = await new FakeOptimizationProvider(
        new FakeRoutingProvider({ distanceFactor: 1 })
      ).optimize(request),
      replacement = await new FakeOptimizationProvider(
        new FakeRoutingProvider({ distanceFactor: 2 })
      ).optimize(request);
    expect(first.ok && replacement.ok && first.value.routes[0]!.travelDistanceMetres).not.toBe(
      replacement.ok && replacement.value.routes[0]!.travelDistanceMetres
    );
  });
});
