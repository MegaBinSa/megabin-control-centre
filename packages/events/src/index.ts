import type { ActorReference, ModuleKey, Uuid } from "@megabin/domain-types";

export const EVENT_NAME_PATTERN = /^[A-Z][A-Za-z0-9]+(?:\.[A-Z][A-Za-z0-9]+)*$/;
export const OUTBOX_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "published",
  "dead_letter"
] as const;

export type OutboxDeliveryStatus = (typeof OUTBOX_DELIVERY_STATUSES)[number];

export interface AggregateReference {
  readonly type: string;
  readonly id: Uuid;
}

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly eventId: Uuid;
  readonly name: string;
  readonly version: number;
  readonly producer: ModuleKey;
  readonly aggregate: AggregateReference;
  readonly occurredAt: string;
  readonly correlationId: Uuid;
  readonly causationId?: Uuid;
  readonly actor?: ActorReference;
  readonly payload: Readonly<TPayload>;
}

export function assertDomainEventContract(event: DomainEvent): void {
  if (!EVENT_NAME_PATTERN.test(event.name)) {
    throw new TypeError("Domain event names must use version-independent PascalCase segments.");
  }

  if (!Number.isSafeInteger(event.version) || event.version < 1) {
    throw new TypeError("Domain event versions must be positive integers.");
  }

  if (event.aggregate.type.trim().length === 0) {
    throw new TypeError("Domain events require an aggregate type.");
  }
}
