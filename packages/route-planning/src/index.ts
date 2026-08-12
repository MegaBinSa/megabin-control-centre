export const routeVersionStatuses = [
  "draft",
  "ready",
  "published",
  "superseded",
  "cancelled",
  "archived"
] as const;
export type RouteVersionStatus = (typeof routeVersionStatuses)[number];
export const unassignedReasonCodes = [
  "missing_coordinates",
  "missing_territory",
  "no_eligible_team",
  "capacity_exceeded",
  "working_window_exceeded",
  "invalid_service_configuration",
  "unsupported_cadence",
  "roster_assignment_unavailable"
] as const;
export type UnassignedReasonCode = (typeof unassignedReasonCodes)[number];
export interface PlannedStop {
  readonly plannedRouteStopId: string;
  readonly clientServiceId: string;
  readonly sequenceNumber: number;
  readonly drumUnits: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly addressSnapshot: Readonly<Record<string, unknown>>;
}
export interface PlannedRoute {
  readonly plannedRouteId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly vehicleCapacityUnits: number;
  readonly plannedCapacityUnits: number;
  readonly plannedDurationMinutes: number;
  readonly usableWindowMinutes: number;
  readonly stops: readonly PlannedStop[];
}
export interface UnassignedService {
  readonly unassignedRouteServiceId: string;
  readonly clientServiceId: string;
  readonly reasonCode: UnassignedReasonCode;
  readonly remediation: string;
}
export interface RoutePlanDocument {
  readonly routeVersionId: string;
  readonly routePlanId: string;
  readonly versionNumber: number;
  readonly versionStatus: RouteVersionStatus;
  readonly isStale: boolean;
  readonly updatedAt: string;
  readonly routes: readonly PlannedRoute[];
  readonly unassignedServices: readonly UnassignedService[];
}
export function routeVersionEditable(status: RouteVersionStatus): boolean {
  return status === "draft";
}
