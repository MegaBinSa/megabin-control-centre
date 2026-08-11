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

  constructor(
    readonly identity: IntegrationIdentity,
    private readonly response: TResult
  ) {
    if (identity.provider !== "fake") {
      throw new TypeError("The fake adapter must use the fake provider identity.");
    }
    if (identity.mode === "live") {
      throw new TypeError("The fake adapter cannot operate in live mode.");
    }
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
    this.interactions.push({ request, context });
    return { ok: true, value: this.response };
  }
}

export async function executeWithAdapter<TRequest, TResult>(
  adapter: IntegrationAdapter<TRequest, TResult>,
  request: TRequest,
  context: AdapterExecutionContext
): Promise<AdapterResult<TResult>> {
  return adapter.execute(request, context);
}
