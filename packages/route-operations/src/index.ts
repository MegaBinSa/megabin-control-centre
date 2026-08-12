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

export const stopOutcomeLabels = {
  cleaned: "Cleaned",
  client_requested_skip: "Client requested skip",
  drum_empty: "Drum empty",
  drum_unavailable: "Drum unavailable",
  could_not_access: "Could not access property",
  drum_missing: "Drum missing",
  account_hold: "Account hold",
  other_issue: "Other issue"
} as const;
export type StopOutcome = keyof typeof stopOutcomeLabels;
export const alertWorthyOutcomes: readonly StopOutcome[] = [
  "could_not_access",
  "drum_missing",
  "other_issue"
];
export function stopOutcomeValidation(
  outcome: StopOutcome,
  actualDrumCount: number | null,
  reason: string | null
): string | null {
  if (outcome === "cleaned" && (!Number.isInteger(actualDrumCount) || (actualDrumCount ?? -1) < 0))
    return "actual_drum_count_required";
  if (
    [
      "drum_unavailable",
      "could_not_access",
      "drum_missing",
      "account_hold",
      "other_issue"
    ].includes(outcome) &&
    !reason?.trim()
  )
    return "reason_required";
  return null;
}
