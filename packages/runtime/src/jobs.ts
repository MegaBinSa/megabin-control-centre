import type { CancellationSignal } from "@megabin/domain-types";

import type { JobStateStore } from "./contracts.js";

export class BackgroundJobRunner {
  constructor(private readonly state: JobStateStore) {}

  async run<TResult>(input: {
    readonly jobId: string;
    readonly jobType: string;
    readonly idempotencyKey: string;
    readonly concurrencyKey: string;
    readonly correlationId: string;
    readonly attempt: number;
    readonly cancellation: CancellationSignal;
    readonly execute: () => Promise<TResult>;
  }): Promise<{ readonly duplicate: boolean; readonly result: TResult }> {
    input.cancellation.throwIfCancellationRequested();
    try {
      return await this.state.runOnce({
        jobId: input.jobId,
        jobType: input.jobType,
        idempotencyKey: input.idempotencyKey,
        concurrencyKey: input.concurrencyKey,
        correlationId: input.correlationId,
        execute: async () => {
          input.cancellation.throwIfCancellationRequested();
          const result = await input.execute();
          input.cancellation.throwIfCancellationRequested();
          return result;
        }
      });
    } catch (error) {
      await this.state.recordFailure({
        jobId: input.jobId,
        correlationId: input.correlationId,
        attempt: input.attempt,
        category:
          error instanceof Error && error.name === "AbortError" ? "cancelled" : "unexpected",
        safeMessage: error instanceof Error ? error.message : "Unknown job failure."
      });
      throw error;
    }
  }
}

export function createCancellationSignal(cancelled = false): CancellationSignal {
  return {
    isCancellationRequested: cancelled,
    throwIfCancellationRequested() {
      if (this.isCancellationRequested) {
        const error = new Error("Job cancellation requested.");
        error.name = "AbortError";
        throw error;
      }
    }
  };
}
