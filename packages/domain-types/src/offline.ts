type Uuid = string;

export interface OfflineAction<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly actionId: Uuid;
  readonly registeredDeviceId: Uuid;
  readonly deviceTimestamp: string;
  readonly clientSequence: number;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
  readonly operationType: string;
  readonly payloadVersion: number;
  readonly payload: Readonly<TPayload>;
}

export type OfflineActionOutcome = "accepted" | "duplicate" | "conflict" | "rejected";

export interface OfflineActionReceipt {
  readonly actionId: Uuid;
  readonly serverReceivedAt: string;
  readonly outcome: OfflineActionOutcome;
  readonly correlationId: Uuid;
  readonly conflictId?: Uuid;
  readonly rejectionCode?: string;
}

export type SyncConflictResolutionStatus = "open" | "resolved" | "dismissed";

export interface SyncConflict {
  readonly conflictId: Uuid;
  readonly actionId: Uuid;
  readonly incoming: Readonly<Record<string, unknown>>;
  readonly authoritativeState: Readonly<Record<string, unknown>>;
  readonly source: { readonly kind: "device" | "integration"; readonly id: Uuid | string };
  readonly reason: string;
  readonly resolutionStatus: SyncConflictResolutionStatus;
  readonly resolvedBy?: Uuid;
  readonly resolvedAt?: string;
}

export function classifyOfflineRetry(
  existingFingerprint: string | undefined,
  incomingFingerprint: string
): "accepted" | "duplicate" | "conflict" {
  if (existingFingerprint === undefined) return "accepted";
  return existingFingerprint === incomingFingerprint ? "duplicate" : "conflict";
}
