import type { OfflineAction, OfflineActionReceipt } from "@megabin/domain-types";

export type RouteOperationStatus =
  | "prepared"
  | "assigned"
  | "available"
  | "accepted"
  | "in_progress"
  | "suspended"
  | "completed"
  | "cancelled"
  | "superseded"
  | "archived";

export type RouteOperationActionType = "accept" | "start" | "suspend" | "resume";

export interface RouteOperationActionPayload extends Record<string, unknown> {
  readonly routeOperationId: string;
  readonly assignmentRevision: number;
  readonly actionType: RouteOperationActionType;
  readonly deviceId?: string;
}

export type RouteOperationOfflineAction = OfflineAction<RouteOperationActionPayload>;
export type RouteOperationActionReceipt = OfflineActionReceipt;

export interface ManifestFreshness {
  readonly routeOperationId: string;
  readonly currentManifestRevision: number;
  readonly localManifestRevision: number;
  readonly stale: boolean;
  readonly refreshRequired: boolean;
  readonly lifecycleStatus: RouteOperationStatus;
  readonly cancelled: boolean;
  readonly superseded: boolean;
}

const transitions: Readonly<Record<RouteOperationActionType, readonly RouteOperationStatus[]>> = {
  accept: ["available"],
  start: ["accepted"],
  suspend: ["in_progress"],
  resume: ["suspended"]
};

export function canApplyRouteOperationAction(
  status: RouteOperationStatus,
  action: RouteOperationActionType
): boolean {
  return transitions[action].includes(status);
}
