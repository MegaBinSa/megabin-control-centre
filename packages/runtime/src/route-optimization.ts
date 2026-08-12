import type {
  OptimizationProvider,
  OptimizationRequest,
  RoutingProvider
} from "@megabin/route-planning";
export interface OptimizationRuntime {
  readonly routing: RoutingProvider;
  readonly optimizer: OptimizationProvider;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxRetryAfterMs?: number;
}
export async function runOptimization(runtime: OptimizationRuntime, input: OptimizationRequest) {
  const health = await runtime.optimizer.health();
  if (health.status === "unhealthy" || health.status === "disabled")
    return {
      ok: false as const,
      classification: "permanent" as const,
      safeMessage: "Optimization provider is unavailable."
    };
  let attempts = 0;
  while (true) {
    attempts++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(Object.assign(new Error("Provider timed out."), { classification: "timeout" })),
        runtime.timeoutMs
      );
    });
    try {
      const result = await Promise.race([runtime.optimizer.optimize(input), timeout]);
      if (timer) clearTimeout(timer);
      if (
        result.ok ||
        !(result.classification === "retryable" || result.classification === "rate_limited") ||
        attempts > runtime.maxRetries
      )
        return result;
      const retryAfterMs = Math.min(
        Math.max(0, result.retryAfterMs ?? 0),
        runtime.maxRetryAfterMs ?? 5000
      );
      if (retryAfterMs > 0) await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    } catch (e) {
      if (timer) clearTimeout(timer);
      return {
        ok: false as const,
        classification: "timeout" as const,
        safeMessage: e instanceof Error ? e.message : "Provider timed out."
      };
    }
  }
}
