import type { IntegrationAdapter } from "@megabin/integrations";
import { createLogRecord } from "@megabin/observability";

import type { ClaimedOutboxEvent, DispatchResult, LogSink, RuntimeDatabase } from "./contracts.js";

export class OutboxDispatcher {
  constructor(
    private readonly database: RuntimeDatabase,
    private readonly adapter: IntegrationAdapter<
      ClaimedOutboxEvent,
      { readonly accepted: boolean }
    >,
    private readonly logs: LogSink,
    private readonly runtime: {
      readonly environment: "local" | "staging" | "production";
      readonly service: string;
      readonly buildId: string;
    },
    private readonly now: () => string
  ) {}

  async run(input: {
    readonly workerId: string;
    readonly batchSize: number;
    readonly maxAttempts: number;
  }): Promise<DispatchResult> {
    const events = await this.database.claimOutbox(input.workerId, input.batchSize);
    let published = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const event of events) {
      const result = await this.adapter.execute(event, {
        correlationId: event.correlationId,
        ...(event.causationId ? { causationId: event.causationId } : {}),
        eventId: event.eventId,
        idempotencyKey: event.eventId
      });
      if (result.ok) {
        await this.database.completeOutbox(event.eventId, input.workerId);
        published += 1;
        this.logs.write(
          createLogRecord({
            timestamp: this.now(),
            level: "info",
            message: "Outbox event published.",
            trace: {
              correlationId: event.correlationId,
              ...(event.causationId ? { causationId: event.causationId } : {}),
              eventId: event.eventId
            },
            runtime: this.runtime,
            metadata: { eventName: event.name, provider: this.adapter.identity.provider }
          })
        );
        continue;
      }

      const disposition = await this.database.failOutbox({
        eventId: event.eventId,
        workerId: input.workerId,
        safeError: result.safeMessage,
        maxAttempts: input.maxAttempts,
        baseDelaySeconds: 1,
        maxDelaySeconds: 60
      });
      if (disposition === "dead_letter") deadLettered += 1;
      else retried += 1;
      this.logs.write(
        createLogRecord({
          timestamp: this.now(),
          level: disposition === "dead_letter" ? "error" : "warn",
          message:
            disposition === "dead_letter"
              ? "Outbox event moved to dead-letter."
              : "Outbox event scheduled for retry.",
          trace: {
            correlationId: event.correlationId,
            ...(event.causationId ? { causationId: event.causationId } : {}),
            eventId: event.eventId
          },
          runtime: this.runtime,
          metadata: { classification: result.classification }
        })
      );
    }

    return { claimed: events.length, published, retried, deadLettered };
  }
}
