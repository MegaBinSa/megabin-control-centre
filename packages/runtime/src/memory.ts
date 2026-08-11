import type { HealthCheckResult } from "@megabin/observability";
import type { FeatureFlagDefinition } from "@megabin/config";

import { ForcedRollbackError, RuntimeError } from "./errors.js";
import type {
  ClaimedOutboxEvent,
  JobStateStore,
  PlatformProofInput,
  PlatformProofResult,
  RuntimeDatabase
} from "./contracts.js";

interface StoredEvent extends Omit<ClaimedOutboxEvent, "attemptCount"> {
  attemptCount: number;
  status: "pending" | "processing" | "published" | "dead_letter";
  workerId?: string;
  replayCount: number;
}

export class MemoryRuntimeDatabase implements RuntimeDatabase {
  readonly proofs = new Map<string, PlatformProofResult>();
  readonly audits: { readonly commandId: string; readonly correlationId: string }[] = [];
  readonly events: StoredEvent[] = [];
  private readonly idempotency = new Map<
    string,
    { readonly fingerprint: string; readonly result: PlatformProofResult }
  >();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly configuration: Readonly<Record<string, unknown>> = {
      "runtime.proof-enabled": true
    },
    private readonly featureFlag: FeatureFlagDefinition = {
      key: "runtime.platform-proof",
      defaultEnabled: true,
      targets: []
    }
  ) {}

  private async withLock<TResult>(key: string, action: () => Promise<TResult>): Promise<TResult> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }

  async executePlatformProof(input: PlatformProofInput): Promise<PlatformProofResult> {
    return this.withLock(input.idempotencyKey, async () => {
      const existing = this.idempotency.get(input.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== input.requestFingerprint) {
          throw new RuntimeError(
            "idempotency_key_reused",
            "The idempotency key was already used for different input.",
            409
          );
        }
        return { ...existing.result, duplicate: true };
      }

      if (input.forceRollback) throw new ForcedRollbackError();

      const result: PlatformProofResult = {
        proofId: input.commandId,
        eventId: `event-${input.commandId}`,
        value: input.value,
        correlationId: input.correlationId,
        duplicate: false
      };
      const event: StoredEvent = {
        eventId: result.eventId,
        name: "Platform.ProofRecorded",
        version: 1,
        payload: { proofId: result.proofId, value: result.value },
        correlationId: input.correlationId,
        causationId: input.commandId,
        attemptCount: 0,
        status: "pending",
        replayCount: 0
      };

      this.proofs.set(result.proofId, result);
      this.audits.push({ commandId: input.commandId, correlationId: input.correlationId });
      this.events.push(event);
      this.idempotency.set(input.idempotencyKey, {
        fingerprint: input.requestFingerprint,
        result
      });
      return result;
    });
  }

  async claimOutbox(workerId: string, limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    const claimed = this.events.filter((event) => event.status === "pending").slice(0, limit);
    for (const event of claimed) {
      event.status = "processing";
      event.workerId = workerId;
      event.attemptCount += 1;
    }
    return claimed.map((event) => ({ ...event }));
  }

  async completeOutbox(eventId: string, workerId: string): Promise<void> {
    const event = this.requireClaim(eventId, workerId);
    event.status = "published";
    delete event.workerId;
  }

  async failOutbox(input: {
    readonly eventId: string;
    readonly workerId: string;
    readonly safeError: string;
    readonly maxAttempts: number;
    readonly baseDelaySeconds: number;
    readonly maxDelaySeconds: number;
  }): Promise<"retry_scheduled" | "dead_letter"> {
    const event = this.requireClaim(input.eventId, input.workerId);
    delete event.workerId;
    if (event.attemptCount >= input.maxAttempts) {
      event.status = "dead_letter";
      return "dead_letter";
    }
    event.status = "pending";
    return "retry_scheduled";
  }

  async replayDeadLetter(eventId: string): Promise<boolean> {
    const event = this.events.find((candidate) => candidate.eventId === eventId);
    if (!event || event.status !== "dead_letter") return false;
    event.status = "pending";
    event.attemptCount = 0;
    event.replayCount += 1;
    return true;
  }

  async getDeadLetters(): Promise<readonly ClaimedOutboxEvent[]> {
    return this.events
      .filter((event) => event.status === "dead_letter")
      .map((event) => ({ ...event }));
  }

  async loadRuntimeConfiguration(): Promise<Readonly<Record<string, unknown>>> {
    return this.configuration;
  }

  async loadFeatureFlag(): Promise<FeatureFlagDefinition> {
    return this.featureFlag;
  }

  async health(): Promise<HealthCheckResult> {
    return { status: "healthy", checkedAt: new Date(0).toISOString(), summary: "Database ready." };
  }

  async outboxHealth(): Promise<HealthCheckResult> {
    const deadLetters = this.events.filter((event) => event.status === "dead_letter").length;
    return {
      status: deadLetters === 0 ? "healthy" : "degraded",
      checkedAt: new Date(0).toISOString(),
      summary: deadLetters === 0 ? "Outbox ready." : "Outbox has dead-letter events.",
      safeDetails: { deadLetters }
    };
  }

  private requireClaim(eventId: string, workerId: string): StoredEvent {
    const event = this.events.find((candidate) => candidate.eventId === eventId);
    if (!event || event.status !== "processing" || event.workerId !== workerId) {
      throw new RuntimeError("conflict", "The outbox event is not claimed by this worker.", 409);
    }
    return event;
  }
}

export class MemoryJobStateStore implements JobStateStore {
  readonly failures: { readonly jobId: string; readonly correlationId: string }[] = [];
  private readonly completed = new Map<string, unknown>();
  private readonly running = new Set<string>();

  async runOnce<TResult>(input: {
    readonly jobId: string;
    readonly jobType: string;
    readonly idempotencyKey: string;
    readonly concurrencyKey: string;
    readonly correlationId: string;
    readonly execute: () => Promise<TResult>;
  }): Promise<{ readonly duplicate: boolean; readonly result: TResult }> {
    const key = `${input.jobType}:${input.idempotencyKey}`;
    if (this.completed.has(key)) {
      return { duplicate: true, result: this.completed.get(key) as TResult };
    }
    if (this.running.has(input.concurrencyKey)) {
      throw new RuntimeError(
        "conflict",
        "A job with this concurrency key is already running.",
        409
      );
    }
    this.running.add(input.concurrencyKey);
    try {
      const result = await input.execute();
      this.completed.set(key, result);
      return { duplicate: false, result };
    } finally {
      this.running.delete(input.concurrencyKey);
    }
  }

  async recordFailure(input: {
    readonly jobId: string;
    readonly correlationId: string;
  }): Promise<void> {
    this.failures.push(input);
  }

  async health(): Promise<HealthCheckResult> {
    return {
      status: "healthy",
      checkedAt: new Date(0).toISOString(),
      summary: "Job runner ready."
    };
  }
}
