import type { RuntimeRpcClient } from "./supabase.js";
export interface FinancialEligibilityHttpDependencies {
  readonly rpc: RuntimeRpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
  readonly defer?: (work: Promise<unknown>) => void;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export function createFinancialEligibilityHandler(deps: FinancialEligibilityHttpDependencies) {
  const run = async (rpc: string, args: Record<string, unknown>, status = 200) => {
    const result = await deps.rpc.rpc(rpc, args);
    if (!result.error) return json({ ok: true, data: result.data }, status);
    if (result.error.code === "42501")
      return json(
        {
          ok: false,
          error: { code: "authorization_denied", message: "Financial eligibility access denied." }
        },
        403
      );
    if (result.error.code === "40001")
      return json(
        {
          ok: false,
          error: {
            code: "stale_financial_decision",
            message: "The decision changed; refresh and retry."
          }
        },
        409
      );
    if (result.error.code === "P0002")
      return json(
        {
          ok: false,
          error: { code: "not_found", message: "Financial eligibility record not found." }
        },
        404
      );
    return json(
      { ok: false, error: { code: "validation_failed", message: result.error.message } },
      400
    );
  };
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/v1/financial-eligibility")) return null;
    if (!deps.actorId)
      return json(
        {
          ok: false,
          error: { code: "authentication_required", message: "Authentication is required." }
        },
        401
      );
    const path = url.pathname.replace("/api/v1/financial-eligibility", "") || "/";
    try {
      if (path === "/decisions" && request.method === "GET")
        return run("financial_eligibility_list", {
          p_actor: deps.actorId,
          p_query: Object.fromEntries(url.searchParams)
        });
      const match =
        /^\/services\/([0-9a-f-]+)(?:\/(simulate|hold|release|override|reevaluate|route-impact))?$/.exec(
          path
        );
      if (match) {
        const service = match[1],
          action = match[2];
        if (!action && request.method === "GET")
          return run("financial_eligibility_detail", { p_actor: deps.actorId, p_service: service });
        if (action === "simulate" && request.method === "POST")
          return run("financial_eligibility_simulate", {
            p_actor: deps.actorId,
            p_service: service
          });
        if (action === "reevaluate" && request.method === "POST")
          return run("financial_eligibility_reevaluate", {
            p_actor: deps.actorId,
            p_service: service,
            p_correlation: deps.id()
          });
        if (action === "route-impact" && request.method === "GET")
          return run("financial_eligibility_detail", { p_actor: deps.actorId, p_service: service });
        const body = (await request.json()) as Record<string, unknown>;
        if (action === "hold" && request.method === "POST")
          return run("financial_eligibility_hold", {
            p_actor: deps.actorId,
            p_service: service,
            p_reason: body.reason,
            p_expected_version: body.expectedVersion,
            p_correlation: deps.id()
          });
        if (action === "release" && request.method === "POST")
          return run("financial_eligibility_release", {
            p_actor: deps.actorId,
            p_service: service,
            p_reason: body.reason,
            p_expected_version: body.expectedVersion,
            p_correlation: deps.id()
          });
        if (action === "override" && request.method === "PUT")
          return run("financial_eligibility_override_set", {
            p_actor: deps.actorId,
            p_service: service,
            p_status: body.status,
            p_reason: body.reason,
            p_until: body.effectiveUntil ?? null,
            p_expected_version: body.expectedVersion,
            p_correlation: deps.id()
          });
        if (action === "override" && request.method === "DELETE")
          return run("financial_eligibility_override_clear", {
            p_actor: deps.actorId,
            p_service: service,
            p_reason: body.reason,
            p_expected_version: body.expectedVersion,
            p_correlation: deps.id()
          });
      }
      if (path === "/reevaluations" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        const started = await deps.rpc.rpc("financial_eligibility_batch_start", {
          p_actor: deps.actorId,
          p_body: body,
          p_correlation: deps.id(),
          p_idempotency: request.headers.get("Idempotency-Key") ?? deps.id()
        });
        if (started.error)
          return run("financial_eligibility_batch_start", {
            p_actor: deps.actorId,
            p_body: body,
            p_correlation: deps.id(),
            p_idempotency: request.headers.get("Idempotency-Key") ?? deps.id()
          });
        const job = started.data as Record<string, unknown>;
        const work = deps.rpc.rpc("financial_eligibility_batch_run", {
          p_job: job.financial_eligibility_job_id ?? job.financialEligibilityJobId
        });
        if (deps.defer) deps.defer(work);
        else await work;
        return json({ ok: true, data: job }, 202);
      }
      return json({ ok: false, error: { code: "not_found", message: "Endpoint not found." } }, 404);
    } catch {
      return json(
        {
          ok: false,
          error: { code: "validation_failed", message: "The request body must be valid JSON." }
        },
        400
      );
    }
  };
}
const op = (operationId: string) => ({
  operationId,
  security: [{ bearerAuth: [] }],
  responses: {
    "200": { description: "Financial eligibility response" },
    "202": { description: "Reevaluation queued" },
    "403": { description: "Permission or region denied" },
    "409": { description: "Optimistic concurrency conflict" }
  }
});
export const financialEligibilityOpenApiPaths: Record<string, unknown> = {
  "/api/v1/financial-eligibility/decisions": { get: op("listFinancialEligibilityDecisions") },
  "/api/v1/financial-eligibility/services/{id}": { get: op("getFinancialEligibility") },
  "/api/v1/financial-eligibility/services/{id}/simulate": {
    post: op("simulateFinancialEligibility")
  },
  "/api/v1/financial-eligibility/services/{id}/hold": { post: op("holdServiceFinancially") },
  "/api/v1/financial-eligibility/services/{id}/release": {
    post: op("releaseServiceFinancialHold")
  },
  "/api/v1/financial-eligibility/services/{id}/override": {
    put: op("setFinancialEligibilityOverride"),
    delete: op("clearFinancialEligibilityOverride")
  },
  "/api/v1/financial-eligibility/services/{id}/reevaluate": {
    post: op("reevaluateServiceFinancialEligibility")
  },
  "/api/v1/financial-eligibility/services/{id}/route-impact": {
    get: op("getFinancialRouteImpact")
  },
  "/api/v1/financial-eligibility/reevaluations": {
    post: op("startFinancialEligibilityReevaluation")
  }
};
