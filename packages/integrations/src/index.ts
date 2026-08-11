import type { HealthCheckResult, TraceContext } from "@megabin/observability";

export type IntegrationMode = "capture" | "test" | "live";
export type IntegrationLifecycleStatus =
  | "installed"
  | "configured"
  | "tested"
  | "enabled"
  | "disabled"
  | "decommissioned";
export type IntegrationErrorClassification =
  | "retryable"
  | "rate_limited"
  | "authentication"
  | "invalid_request"
  | "permanent";

export interface IntegrationIdentity {
  readonly integrationId: string;
  readonly provider: string;
  readonly capability: string;
  readonly environment: "local" | "staging" | "production";
  readonly mode: IntegrationMode;
}

export interface IntegrationContract extends IntegrationIdentity {
  readonly lifecycleStatus: IntegrationLifecycleStatus;
  readonly permittedInboundFields: readonly string[];
  readonly permittedOutboundEvents: readonly string[];
  readonly authenticationReference?: string;
  readonly lastSuccessfulInteractionAt?: string;
  readonly lastFailureAt?: string;
  readonly failureSummary?: string;
}

export interface AdapterExecutionContext extends TraceContext {
  readonly idempotencyKey: string;
}

export type AdapterResult<TResult> =
  | { readonly ok: true; readonly value: TResult }
  | {
      readonly ok: false;
      readonly classification: IntegrationErrorClassification;
      readonly safeMessage: string;
    };

export interface IntegrationAdapter<TRequest, TResult> {
  readonly identity: IntegrationIdentity;
  healthCheck(): Promise<HealthCheckResult>;
  execute(request: TRequest, context: AdapterExecutionContext): Promise<AdapterResult<TResult>>;
}

export class FakeIntegrationAdapter<TRequest, TResult>
  implements IntegrationAdapter<TRequest, TResult>
{
  readonly interactions: {
    readonly request: TRequest;
    readonly context: AdapterExecutionContext;
  }[] = [];
  private readonly results = new Map<string, AdapterResult<TResult>>();
  private readonly failurePlan: IntegrationErrorClassification[];

  constructor(
    readonly identity: IntegrationIdentity,
    private readonly response: TResult,
    failurePlan: readonly IntegrationErrorClassification[] = []
  ) {
    if (identity.provider !== "fake") {
      throw new TypeError("The fake adapter must use the fake provider identity.");
    }
    if (identity.mode === "live") {
      throw new TypeError("The fake adapter cannot operate in live mode.");
    }
    this.failurePlan = [...failurePlan];
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "healthy",
      checkedAt: new Date(0).toISOString(),
      summary: "Fake adapter is available."
    };
  }

  async execute(
    request: TRequest,
    context: AdapterExecutionContext
  ): Promise<AdapterResult<TResult>> {
    const existing = this.results.get(context.idempotencyKey);
    if (existing) return existing;

    this.interactions.push({ request, context });
    const plannedFailure = this.failurePlan.shift();
    const result: AdapterResult<TResult> = plannedFailure
      ? { ok: false, classification: plannedFailure, safeMessage: "Synthetic adapter failure." }
      : { ok: true, value: this.response };
    if (result.ok) this.results.set(context.idempotencyKey, result);
    return result;
  }
}

export async function executeWithAdapter<TRequest, TResult>(
  adapter: IntegrationAdapter<TRequest, TResult>,
  request: TRequest,
  context: AdapterExecutionContext
): Promise<AdapterResult<TResult>> {
  return adapter.execute(request, context);
}
