import type { ActorReference } from "@megabin/domain-types";
import type { FeatureFlagContext, FeatureFlagDefinition } from "@megabin/config";
import type { AdapterResult, IntegrationAdapter } from "@megabin/integrations";
import type {
  HealthCheckResult,
  RuntimeMetadata,
  StructuredLogRecord,
  TraceContext
} from "@megabin/observability";

export interface PlatformProofInput {
  readonly commandId: string;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly value: string;
  readonly forceRollback: boolean;
}

export interface PlatformProofResult {
  readonly proofId: string;
  readonly eventId: string;
  readonly value: string;
  readonly correlationId: string;
  readonly duplicate: boolean;
}

export interface ClaimedOutboxEvent {
  readonly eventId: string;
  readonly name: string;
  readonly version: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly attemptCount: number;
}

export interface RuntimeConfiguration {
  readonly proofEnabled: boolean;
  readonly dispatcherBatchSize: number;
  readonly dispatcherMaxAttempts: number;
}

export interface RuntimeDatabase {
  executePlatformProof(input: PlatformProofInput): Promise<PlatformProofResult>;
  claimOutbox(workerId: string, limit: number): Promise<readonly ClaimedOutboxEvent[]>;
  completeOutbox(eventId: string, workerId: string): Promise<void>;
  failOutbox(input: {
    readonly eventId: string;
    readonly workerId: string;
    readonly safeError: string;
    readonly maxAttempts: number;
    readonly baseDelaySeconds: number;
    readonly maxDelaySeconds: number;
  }): Promise<"retry_scheduled" | "dead_letter">;
  replayDeadLetter(eventId: string, actorId: string): Promise<boolean>;
  getDeadLetters(): Promise<readonly ClaimedOutboxEvent[]>;
  loadRuntimeConfiguration(
    environment: "local" | "staging" | "production"
  ): Promise<Readonly<Record<string, unknown>>>;
  loadFeatureFlag(flagKey: string): Promise<FeatureFlagDefinition>;
  health(): Promise<HealthCheckResult>;
  outboxHealth(): Promise<HealthCheckResult>;
}

export interface Authenticator {
  authenticate(request: Request): Promise<ActorReference | null>;
}

export interface Authorizer {
  isAllowed(actor: ActorReference, permission: string): Promise<boolean>;
}

export interface LogSink {
  write(record: StructuredLogRecord): void;
}

export interface RuntimeDependencies {
  readonly environment: "local" | "staging" | "production";
  readonly runtime: RuntimeMetadata;
  readonly database: RuntimeDatabase;
  readonly authenticator: Authenticator;
  readonly authorizer: Authorizer;
  readonly adapter: IntegrationAdapter<ClaimedOutboxEvent, { readonly accepted: boolean }>;
  readonly logs: LogSink;
  readonly jobs: JobStateStore;
  readonly flagContext: (actor: ActorReference) => FeatureFlagContext;
  readonly now: () => string;
  readonly id: () => string;
}

export interface DispatchResult {
  readonly claimed: number;
  readonly published: number;
  readonly retried: number;
  readonly deadLettered: number;
}

export interface JobStateStore {
  runOnce<TResult>(input: {
    readonly jobId: string;
    readonly jobType: string;
    readonly idempotencyKey: string;
    readonly concurrencyKey: string;
    readonly correlationId: string;
    readonly execute: () => Promise<TResult>;
  }): Promise<{ readonly duplicate: boolean; readonly result: TResult }>;
  recordFailure(input: {
    readonly jobId: string;
    readonly correlationId: string;
    readonly attempt: number;
    readonly category: string;
    readonly safeMessage: string;
  }): Promise<void>;
  health(): Promise<HealthCheckResult>;
}

export type AdapterDispatchResult = AdapterResult<{ readonly accepted: boolean }>;
export type WorkflowTrace = TraceContext;
