import type { HealthCheckResult } from "@megabin/observability";
import type { AdapterResult, IntegrationErrorClassification } from "@megabin/integrations";
/* eslint-disable @typescript-eslint/no-non-null-assertion -- indexed geometry is guarded by slice boundaries */

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}
export type TravelEstimateMode = "static_road" | "traffic_aware";
export interface TravelEstimate {
  readonly distanceMetres: number;
  readonly durationSeconds: number;
  readonly mode: TravelEstimateMode;
}
export interface TravelMatrix {
  readonly origins: number;
  readonly destinations: number;
  readonly estimates: readonly (readonly TravelEstimate[])[];
}
export interface RouteGeometry {
  readonly format: "geojson_linestring";
  readonly coordinates: readonly (readonly [number, number])[];
  readonly source: "provider_road" | "baseline_schematic";
}
export interface RoutingRequest {
  readonly points: readonly GeoPoint[];
  readonly mode: TravelEstimateMode;
}
export interface RoutingResult {
  readonly legs: readonly TravelEstimate[];
  readonly geometry: RouteGeometry;
  readonly providerMetadata: Readonly<Record<string, string | number | boolean>>;
}
export interface RoutingProvider {
  readonly providerKey: string;
  readonly adapterVersion: string;
  capabilities(): readonly ("point_to_point" | "matrix" | "ordered_route" | "geometry")[];
  health(): Promise<HealthCheckResult>;
  matrix(points: readonly GeoPoint[]): Promise<AdapterResult<TravelMatrix>>;
  route(request: RoutingRequest): Promise<AdapterResult<RoutingResult>>;
}

export interface OptimizationVehicle {
  readonly routeId: string;
  readonly teamId: string;
  readonly capacityUnits: number;
  readonly usableWindowMinutes: number;
  readonly start: GeoPoint;
  readonly end: GeoPoint;
}
export interface OptimizationStop {
  readonly stopId: string;
  readonly eligibleRouteIds: readonly string[];
  readonly point: GeoPoint;
  readonly capacityUnits: number;
  readonly serviceDurationMinutes: number;
  readonly timeWindow?: Readonly<{ startMinute: number; endMinute: number }>;
  readonly kind?: "client_service" | "special";
  readonly capacityReset?: boolean;
}
export interface OptimizationRequest {
  readonly inputSignature: string;
  readonly deterministicSeed: number;
  readonly vehicles: readonly OptimizationVehicle[];
  readonly stops: readonly OptimizationStop[];
}
export interface OptimizedRoute {
  readonly routeId: string;
  readonly stopIds: readonly string[];
  readonly travelDistanceMetres: number;
  readonly travelDurationSeconds: number;
  readonly routeDurationMinutes: number;
  readonly geometry: RouteGeometry;
}
export interface OptimizationResult {
  readonly routes: readonly OptimizedRoute[];
  readonly unassignedStopIds: readonly string[];
  readonly warnings: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}
export interface OptimizationProvider {
  readonly providerKey: string;
  readonly adapterVersion: string;
  health(): Promise<HealthCheckResult>;
  optimize(request: OptimizationRequest): Promise<AdapterResult<OptimizationResult>>;
}

export interface FakeProviderOptions {
  readonly failure?: IntegrationErrorClassification;
  readonly health?: HealthCheckResult["status"];
  readonly distanceFactor?: number;
}
const failure = <T>(classification: IntegrationErrorClassification): AdapterResult<T> => ({
  ok: false,
  classification,
  safeMessage: "Synthetic provider failure."
});
const leg = (a: GeoPoint, b: GeoPoint, factor: number): TravelEstimate => {
  const dy = (b.latitude - a.latitude) * 111_320,
    dx = (b.longitude - a.longitude) * 100_000,
    distance = Math.round(Math.hypot(dx, dy) * factor);
  return {
    distanceMetres: distance,
    durationSeconds: Math.max(60, Math.round(distance / 8.33)),
    mode: "static_road"
  };
};
export class FakeRoutingProvider implements RoutingProvider {
  readonly providerKey = "fake-routing";
  readonly adapterVersion = "1";
  constructor(private readonly options: FakeProviderOptions = {}) {}
  capabilities() {
    return ["point_to_point", "matrix", "ordered_route", "geometry"] as const;
  }
  async health(): Promise<HealthCheckResult> {
    return {
      status: this.options.health ?? "healthy",
      checkedAt: new Date(0).toISOString(),
      summary: "Deterministic fake routing provider."
    };
  }
  async matrix(points: readonly GeoPoint[]): Promise<AdapterResult<TravelMatrix>> {
    if (this.options.failure) return failure(this.options.failure);
    return {
      ok: true,
      value: {
        origins: points.length,
        destinations: points.length,
        estimates: points.map((a) =>
          points.map((b) => leg(a, b, this.options.distanceFactor ?? 1.25))
        )
      }
    };
  }
  async route(request: RoutingRequest): Promise<AdapterResult<RoutingResult>> {
    if (this.options.failure) return failure(this.options.failure);
    const legs = request.points
      .slice(1)
      .map((p, i) => leg(request.points[i]!, p, this.options.distanceFactor ?? 1.25));
    return {
      ok: true,
      value: {
        legs,
        geometry: {
          format: "geojson_linestring",
          coordinates: request.points.map((p) => [p.longitude, p.latitude] as const),
          source: "provider_road"
        },
        providerMetadata: { synthetic: true }
      }
    };
  }
}
export class FakeOptimizationProvider implements OptimizationProvider {
  readonly providerKey = "fake-optimizer";
  readonly adapterVersion = "1";
  constructor(
    private readonly routing: RoutingProvider,
    private readonly options: FakeProviderOptions = {}
  ) {}
  health() {
    return this.options.health
      ? Promise.resolve({
          status: this.options.health,
          checkedAt: new Date(0).toISOString(),
          summary: "Deterministic fake optimization provider."
        })
      : this.routing.health();
  }
  async optimize(request: OptimizationRequest): Promise<AdapterResult<OptimizationResult>> {
    if (this.options.failure) return failure(this.options.failure);
    const remaining = new Map(
      request.vehicles.map((v) => [
        v.routeId,
        {
          capacity: v.capacityUnits,
          stops: [] as OptimizationStop[]
        }
      ])
    );
    const unassigned: string[] = [];
    for (const stop of [...request.stops].sort((a, b) => a.stopId.localeCompare(b.stopId))) {
      let target: readonly [string, NonNullable<ReturnType<typeof remaining.get>>] | undefined;
      for (const id of stop.eligibleRouteIds) {
        const state = remaining.get(id),
          vehicle = request.vehicles.find((candidate) => candidate.routeId === id);
        if (!state || !vehicle || state.capacity < stop.capacityUnits) continue;
        const tentative = [...state.stops, stop],
          estimate = await this.routing.route({
            points: [vehicle.start, ...tentative.map((candidate) => candidate.point), vehicle.end],
            mode: "static_road"
          });
        if (!estimate.ok) return estimate;
        const travelMinutes = Math.ceil(
            estimate.value.legs.reduce((total, routeLeg) => total + routeLeg.durationSeconds, 0) /
              60
          ),
          serviceMinutes = tentative.reduce(
            (total, candidate) => total + candidate.serviceDurationMinutes,
            0
          );
        if (travelMinutes + serviceMinutes <= vehicle.usableWindowMinutes) {
          target = [id, state] as const;
          break;
        }
      }
      if (!target?.[1]) {
        unassigned.push(stop.stopId);
        continue;
      }
      target[1].capacity -= stop.capacityUnits;
      target[1].stops.push(stop);
    }
    const routes: OptimizedRoute[] = [];
    for (const vehicle of request.vehicles) {
      const assigned = remaining.get(vehicle.routeId)!.stops;
      const rr = await this.routing.route({
        points: [vehicle.start, ...assigned.map((s) => s.point), vehicle.end],
        mode: "static_road"
      });
      if (!rr.ok) return rr;
      const distance = rr.value.legs.reduce((n, x) => n + x.distanceMetres, 0),
        travel = rr.value.legs.reduce((n, x) => n + x.durationSeconds, 0);
      routes.push({
        routeId: vehicle.routeId,
        stopIds: assigned.map((s) => s.stopId),
        travelDistanceMetres: distance,
        travelDurationSeconds: travel,
        routeDurationMinutes:
          Math.ceil(travel / 60) + assigned.reduce((n, s) => n + s.serviceDurationMinutes, 0),
        geometry: rr.value.geometry
      });
    }
    return {
      ok: true,
      value: {
        routes,
        unassignedStopIds: unassigned,
        warnings: [],
        metadata: { provider: this.providerKey, seed: request.deterministicSeed }
      }
    };
  }
}
