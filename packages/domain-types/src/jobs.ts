type Uuid = string;

export type JobFailureCategory =
  | "transient_dependency"
  | "permanent_dependency"
  | "validation"
  | "concurrency"
  | "cancelled"
  | "unexpected";

export interface BackgroundJobInvocation<TPayload = unknown> {
  readonly jobId: Uuid;
  readonly jobType: string;
  readonly idempotencyKey: string;
  readonly concurrencyKey: string;
  readonly correlationId: Uuid;
  readonly attempt: number;
  readonly requestedAt: string;
  readonly payload: TPayload;
}

export interface BackgroundJobResult {
  readonly jobId: Uuid;
  readonly status: "succeeded" | "retry_scheduled" | "failed" | "cancelled";
  readonly completedAt: string;
  readonly failureCategory?: JobFailureCategory;
  readonly retryAt?: string;
}

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
  throwIfCancellationRequested(): void;
}
