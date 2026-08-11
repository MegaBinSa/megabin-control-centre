export const MODULE_KEYS = [
  "identity-access",
  "clients",
  "service-addresses",
  "service-configuration",
  "geography",
  "workforce",
  "vehicles",
  "daily-roster",
  "routes",
  "route-operations",
  "vehicle-tracking",
  "operational-issues",
  "needs-attention",
  "communications",
  "integrations",
  "configuration",
  "reporting",
  "audit",
  "system-health"
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Uuid = string;

export interface ActorReference {
  readonly kind: "user" | "system" | "integration";
  readonly id: Uuid | string;
}

export interface CommandContext {
  readonly commandId: Uuid;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
  readonly causationId?: Uuid;
  readonly actor: ActorReference;
  readonly receivedAt: string;
}
