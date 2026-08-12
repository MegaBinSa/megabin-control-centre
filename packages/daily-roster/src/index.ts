export const operationalDayStatuses = [
  "draft",
  "ready",
  "locked",
  "active",
  "closed",
  "archived"
] as const;
export type OperationalDayStatus = (typeof operationalDayStatuses)[number];
export interface OperationalDay {
  readonly operationalDayId: string;
  readonly serviceDate: string;
  readonly serviceRegionId: string;
  readonly timezone: string;
  readonly lifecycleStatus: OperationalDayStatus;
  readonly generatedAt: string | null;
  readonly lockedAt: string | null;
  readonly updatedAt: string;
}
export interface RosterStaffAssignment {
  readonly staffId: string;
  readonly displayName: string;
  readonly assignmentRole: string;
  readonly expectedTeamId: string | null;
  readonly isSubstitution: boolean;
  readonly substitutionReason: string | null;
}
export interface DailyRosterEntry {
  readonly dailyRosterEntryId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly normalVehicleId: string | null;
  readonly assignedVehicleId: string | null;
  readonly vehicleName: string | null;
  readonly normalDepotId: string | null;
  readonly assignedDepotId: string | null;
  readonly depotName: string | null;
  readonly entryStatus: string;
  readonly availabilityState: string;
  readonly vehicleIsSubstitution: boolean;
  readonly depotIsOverride: boolean;
  readonly substitutionReason: string | null;
  readonly version: number;
  readonly updatedAt: string;
  readonly staff: readonly RosterStaffAssignment[];
}
export interface DailyRosterModel {
  readonly operationalDay: OperationalDay;
  readonly entries: readonly DailyRosterEntry[];
}
export interface ReadinessIssue {
  readonly code: string;
  readonly entryId: string;
  readonly blocking: boolean;
}
export interface ReadinessResult {
  readonly ready: boolean;
  readonly issues: readonly ReadinessIssue[];
}

const transitions: Readonly<Record<OperationalDayStatus, readonly OperationalDayStatus[]>> = {
  draft: ["ready"],
  ready: ["draft", "locked"],
  locked: ["ready", "active"],
  active: ["locked", "closed"],
  closed: ["archived"],
  archived: []
};
export function canTransition(from: OperationalDayStatus, to: OperationalDayStatus): boolean {
  return transitions[from].includes(to);
}
