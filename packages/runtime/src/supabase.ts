import type { FeatureFlagDefinition } from "@megabin/config";
import type { HealthCheckResult } from "@megabin/observability";

import type {
  ClaimedOutboxEvent,
  PlatformProofInput,
  PlatformProofResult,
  RuntimeDatabase
} from "./contracts.js";
import { RuntimeError } from "./errors.js";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}

export interface RuntimeRpcClient {
  rpc(
    functionName: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ readonly data: unknown; readonly error: RpcError | null }>;
}

export class SupabaseRuntimeDatabase implements RuntimeDatabase {
  constructor(private readonly client: RuntimeRpcClient) {}

  async executePlatformProof(input: PlatformProofInput): Promise<PlatformProofResult> {
    try {
      const data = await this.call("execute_platform_proof", {
        p_command_id: input.commandId,
        p_actor_id: input.actorId,
        p_idempotency_key: input.idempotencyKey,
        p_request_fingerprint: input.requestFingerprint,
        p_correlation_id: input.correlationId,
        p_value: input.value,
        p_force_rollback: input.forceRollback
      });
      return data as PlatformProofResult;
    } catch (error) {
      if (error instanceof Error && error.message.includes("idempotency_key_reused")) {
        throw new RuntimeError(
          "idempotency_key_reused",
          "The idempotency key was already used for different input.",
          409
        );
      }
      throw error;
    }
  }

  async claimOutbox(workerId: string, limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    const data = (await this.call("claim_outbox_events", {
      p_worker_id: workerId,
      p_limit: limit
    })) as Record<string, unknown>[];
    return data.map(mapEvent);
  }

  async completeOutbox(eventId: string, workerId: string): Promise<void> {
    await this.call("complete_outbox_event", { p_event_id: eventId, p_worker_id: workerId });
  }

  async failOutbox(input: {
    readonly eventId: string;
    readonly workerId: string;
    readonly safeError: string;
    readonly maxAttempts: number;
    readonly baseDelaySeconds: number;
    readonly maxDelaySeconds: number;
  }): Promise<"retry_scheduled" | "dead_letter"> {
    return (await this.call("fail_outbox_event", {
      p_event_id: input.eventId,
      p_worker_id: input.workerId,
      p_safe_error: input.safeError,
      p_max_attempts: input.maxAttempts,
      p_base_delay_seconds: input.baseDelaySeconds,
      p_max_delay_seconds: input.maxDelaySeconds
    })) as "retry_scheduled" | "dead_letter";
  }

  async replayDeadLetter(eventId: string, actorId: string): Promise<boolean> {
    return (await this.call("replay_dead_letter_event", {
      p_event_id: eventId,
      p_actor_id: actorId
    })) as boolean;
  }

  async getDeadLetters(): Promise<readonly ClaimedOutboxEvent[]> {
    const data = (await this.call("get_dead_letter_events")) as Record<string, unknown>[];
    return data.map(mapEvent);
  }

  async loadRuntimeConfiguration(
    environment: "local" | "staging" | "production"
  ): Promise<Readonly<Record<string, unknown>>> {
    return (await this.call("get_runtime_configuration", {
      p_environment_name: environment
    })) as Readonly<Record<string, unknown>>;
  }

  async loadFeatureFlag(flagKey: string): Promise<FeatureFlagDefinition> {
    return (await this.call("get_runtime_feature_flag", {
      p_flag_key: flagKey
    })) as FeatureFlagDefinition;
  }

  async health(): Promise<HealthCheckResult> {
    return (await this.call("get_database_health")) as HealthCheckResult;
  }

  async outboxHealth(): Promise<HealthCheckResult> {
    return (await this.call("get_outbox_health")) as HealthCheckResult;
  }

  private async call(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, parameters);
    if (error) throw new Error(`${error.code ?? "database_error"}: ${error.message}`);
    return data;
  }
}

function mapEvent(row: Record<string, unknown>): ClaimedOutboxEvent {
  return {
    eventId: row.event_id as string,
    name: row.event_name as string,
    version: row.event_version as number,
    payload: row.payload as Readonly<Record<string, unknown>>,
    correlationId: row.correlation_id as string,
    ...(row.causation_id ? { causationId: row.causation_id as string } : {}),
    attemptCount: row.attempt_count as number
  };
}
