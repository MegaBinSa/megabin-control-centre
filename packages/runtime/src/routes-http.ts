import type { ApiErrorCode } from "@megabin/api-client";
import type {
  OptimizationProvider,
  OptimizationRequest,
  RoutingProvider
} from "@megabin/route-planning";
import { runOptimization } from "./route-optimization.js";
export interface RouteRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}
export interface RouteHttpDependencies {
  readonly rpc: RouteRpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
  readonly routing?: RoutingProvider;
  readonly optimizer?: OptimizationProvider;
  readonly providerRuntime?: Readonly<{
    timeoutMs: number;
    maxRetries: number;
    maxRetryAfterMs: number;
    maxStops: number;
  }>;
  readonly defer?: (work: Promise<void>) => void;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (code: ApiErrorCode, message: string, status: number, correlationId: string) =>
  json({ ok: false, error: { code, message, correlationId } }, status);
const camel = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(camel)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, x]) => [
            k.replace(/_([a-z])/g, (_m, l: string) => l.toUpperCase()),
            camel(x)
          ])
        )
      : v;
async function execute(
  name: string,
  parameters: Record<string, unknown>,
  deps: RouteHttpDependencies,
  cid: string,
  status = 200
) {
  const r = await deps.rpc.rpc(name, parameters);
  return respond(r, cid, status);
}
function respond(r: Awaited<ReturnType<RouteRpcClient["rpc"]>>, cid: string, status = 200) {
  if (!r.error) return json({ ok: true, data: camel(r.data) }, status);
  const m = r.error.message;
  if (r.error.code === "42501") return fail("permission_denied", "Permission denied.", 403, cid);
  if (r.error.code === "P0002")
    return fail("not_found", "The requested route plan was not found.", 404, cid);
  if (r.error.code === "40001" || m.includes("stale_update"))
    return fail("conflict", "The route version changed. Refresh and retry.", 409, cid);
  if (r.error.code === "22023" || r.error.code === "55000")
    return fail("validation_failed", m.split("\n")[0] ?? "Route validation failed.", 400, cid);
  return fail("internal_error", "The request could not be completed.", 500, cid);
}
export function createRouteHandler(
  deps: RouteHttpDependencies
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (
      !path.startsWith("/route-plans") &&
      !path.startsWith("/route-versions") &&
      !path.startsWith("/route-optimizations") &&
      !path.startsWith("/route-providers")
    )
      return null;
    const cid = request.headers.get("X-Correlation-Id") ?? deps.id();
    if (!deps.actorId)
      return fail("authentication_required", "Authentication is required.", 401, cid);
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      !request.headers.get("Idempotency-Key")
    )
      return fail("validation_failed", "Idempotency-Key is required.", 400, cid);
    const actor = deps.actorId;
    try {
      if (path === "/route-optimizations" && request.method === "POST") {
        if (!deps.routing || !deps.optimizer)
          return fail("internal_error", "Optimization providers are not configured.", 500, cid);
        const b = (await request.json()) as Record<string, unknown>;
        const parameters = {
          p_actor_id: actor,
          p_source_version_id: b.sourceVersionId,
          p_expected_updated_at: b.expectedUpdatedAt,
          p_correlation_id: cid,
          p_routing_provider: deps.routing.providerKey,
          p_optimization_provider: deps.optimizer.providerKey,
          p_adapter_version: deps.optimizer.adapterVersion
        };
        const started = await deps.rpc.rpc("route_optimization_start", parameters);
        if (started.error) return respond(started, cid);
        const attempt = camel(started.data) as Record<string, unknown>;
        const work = completeOptimization(deps, actor, cid, attempt);
        if (deps.defer) {
          deps.defer(work.then(() => undefined));
          return json({ ok: true, data: attempt }, 202);
        }
        const completed = await work;
        return completed
          ? json({ ok: true, data: camel(completed) }, 202)
          : fail("internal_error", "The optimization result could not be recorded.", 500, cid);
      }
      const optimizationMatch = /^\/route-optimizations\/([0-9a-f-]+)(?:\/(accept|reject))?$/.exec(
        path
      );
      if (optimizationMatch) {
        if (!optimizationMatch[2] && request.method === "GET")
          return execute(
            "route_optimization_get",
            { p_actor_id: actor, p_attempt_id: optimizationMatch[1] },
            deps,
            cid
          );
        if (optimizationMatch[2] && request.method === "POST") {
          const b = (await request.json()) as Record<string, unknown>;
          return execute(
            optimizationMatch[2] === "accept"
              ? "route_optimization_apply"
              : "route_optimization_reject",
            optimizationMatch[2] === "accept"
              ? {
                  p_actor_id: actor,
                  p_attempt_id: optimizationMatch[1],
                  p_expected_source_updated_at: b.expectedSourceUpdatedAt,
                  p_correlation_id: cid
                }
              : {
                  p_actor_id: actor,
                  p_attempt_id: optimizationMatch[1],
                  p_reason: b.reason,
                  p_correlation_id: cid
                },
            deps,
            cid
          );
        }
      }
      if (path === "/route-providers/health" && request.method === "GET")
        return execute(
          "route_provider_health",
          { p_actor_id: actor, p_region_id: url.searchParams.get("serviceRegionId") },
          deps,
          cid
        );
      if (path === "/route-plans" && request.method === "GET")
        return execute(
          "route_plan_find",
          {
            p_actor_id: actor,
            p_service_region_id: url.searchParams.get("serviceRegionId"),
            p_service_date: url.searchParams.get("serviceDate")
          },
          deps,
          cid
        );
      if (path === "/route-plans/generate" && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "route_generate",
          {
            p_actor_id: actor,
            p_operational_day_id: b.operationalDayId,
            p_correlation_id: cid,
            p_force_new: false,
            p_source_version_id: null,
            p_reason: null
          },
          deps,
          cid,
          201
        );
      }
      let m = /^\/route-plans\/([0-9a-f-]+)$/.exec(path);
      if (m && request.method === "GET")
        return execute("route_plan_get", { p_actor_id: actor, p_route_plan_id: m[1] }, deps, cid);
      m = /^\/route-plans\/([0-9a-f-]+)\/replan$/.exec(path);
      if (m && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "route_generate",
          {
            p_actor_id: actor,
            p_operational_day_id: b.operationalDayId,
            p_correlation_id: cid,
            p_force_new: true,
            p_source_version_id: b.sourceVersionId,
            p_reason: b.reason
          },
          deps,
          cid,
          201
        );
      }
      m = /^\/route-versions\/([0-9a-f-]+)\/stops\/([0-9a-f-]+)\/unassign$/.exec(path);
      if (m && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "route_stop_unassign",
          { p_actor_id: actor, p_stop_id: m[2], p_reason: b.reason, p_correlation_id: cid },
          deps,
          cid
        );
      }
      m = /^\/route-versions\/([0-9a-f-]+)\/unassigned\/([0-9a-f-]+)\/assign$/.exec(path);
      if (m && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "route_service_assign",
          {
            p_actor_id: actor,
            p_unassigned_id: m[2],
            p_target_route_id: b.targetRouteId,
            p_target_sequence: b.targetSequence,
            p_reason: b.reason,
            p_correlation_id: cid
          },
          deps,
          cid
        );
      }
      m = /^\/route-versions\/([0-9a-f-]+)\/routes\/([0-9a-f-]+)\/start-time$/.exec(path);
      if (m && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "route_start_time_update",
          {
            p_actor_id: actor,
            p_planned_route_id: m[2],
            p_planned_start_at: b.plannedStartAt,
            p_reason: b.reason,
            p_correlation_id: cid
          },
          deps,
          cid
        );
      }
      m = /^\/route-versions\/([0-9a-f-]+)(?:\/(validate|ready|publish))?$/.exec(path);
      if (m) {
        if (!m[2] && request.method === "GET")
          return execute(
            "route_version_get",
            { p_actor_id: actor, p_route_version_id: m[1] },
            deps,
            cid
          );
        if (m[2] === "validate" && request.method === "POST")
          return execute(
            "route_validate",
            { p_actor_id: actor, p_route_version_id: m[1] },
            deps,
            cid
          );
        if ((m[2] === "ready" || m[2] === "publish") && request.method === "POST") {
          const b = (await request.json()) as Record<string, unknown>;
          return execute(
            "route_transition",
            {
              p_actor_id: actor,
              p_route_version_id: m[1],
              p_target: m[2] === "publish" ? "published" : "ready",
              p_expected_updated_at: b.expectedUpdatedAt,
              p_correlation_id: cid
            },
            deps,
            cid
          );
        }
      }
      m = /^\/route-versions\/([0-9a-f-]+)\/stops\/([0-9a-f-]+)\/move$/.exec(path);
      if (m && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "route_stop_move",
          {
            p_actor_id: actor,
            p_stop_id: m[2],
            p_target_route_id: b.targetRouteId,
            p_target_sequence: b.targetSequence,
            p_reason: b.reason,
            p_correlation_id: cid
          },
          deps,
          cid
        );
      }
      return fail("not_found", "The requested endpoint does not exist.", 404, cid);
    } catch {
      return fail("validation_failed", "The request body must be valid JSON.", 400, cid);
    }
  };
}
async function completeOptimization(
  deps: RouteHttpDependencies,
  actor: string,
  cid: string,
  attempt: Record<string, unknown>
): Promise<unknown | null> {
  if (!deps.routing || !deps.optimizer) return null;
  const startedAt = Date.now();
  const input = attempt.inputSnapshot as OptimizationRequest;
  const limits = deps.providerRuntime ?? {
    timeoutMs: 15000,
    maxRetries: 2,
    maxRetryAfterMs: 5000,
    maxStops: 200
  };
  if (input.stops.length > limits.maxStops) {
    const rejected = await deps.rpc.rpc("route_optimization_fail", {
      p_actor_id: actor,
      p_attempt_id: attempt.routeOptimizationAttemptId,
      p_classification: "invalid_request",
      p_summary: "The route plan exceeds the configured provider request-size limit.",
      p_duration_ms: Date.now() - startedAt,
      p_correlation_id: cid
    });
    return rejected.error ? null : rejected.data;
  }
  const result = await runOptimization(
    {
      routing: deps.routing,
      optimizer: deps.optimizer,
      timeoutMs: limits.timeoutMs,
      maxRetries: limits.maxRetries,
      maxRetryAfterMs: limits.maxRetryAfterMs
    },
    input
  );
  let completed = result.ok
    ? await deps.rpc.rpc("route_optimization_complete", {
        p_actor_id: actor,
        p_attempt_id: attempt.routeOptimizationAttemptId,
        p_result: result.value,
        p_duration_ms: Date.now() - startedAt,
        p_correlation_id: cid
      })
    : await deps.rpc.rpc("route_optimization_fail", {
        p_actor_id: actor,
        p_attempt_id: attempt.routeOptimizationAttemptId,
        p_classification: result.classification,
        p_summary: result.safeMessage,
        p_duration_ms: Date.now() - startedAt,
        p_correlation_id: cid
      });
  if (result.ok && completed.error) {
    completed = await deps.rpc.rpc("route_optimization_fail", {
      p_actor_id: actor,
      p_attempt_id: attempt.routeOptimizationAttemptId,
      p_classification: "invalid_response",
      p_summary: "The provider result failed independent validation.",
      p_duration_ms: Date.now() - startedAt,
      p_correlation_id: cid
    });
  }
  return completed.error ? null : completed.data;
}
export function routeOpenApiPaths(): Record<string, unknown> {
  const op = (operationId: string) => ({
    operationId,
    security: [{ bearerAuth: [] }],
    responses: {
      "200": { description: "Route-planning response" },
      "400": { description: "Validation failure" },
      "403": { description: "Permission denied" },
      "409": { description: "Stale version" }
    }
  });
  return {
    "/api/v1/route-plans": { get: op("findRoutePlan") },
    "/api/v1/route-optimizations": { post: op("startRouteOptimization") },
    "/api/v1/route-optimizations/{id}": { get: op("getRouteOptimization") },
    "/api/v1/route-optimizations/{id}/accept": { post: op("acceptRouteOptimization") },
    "/api/v1/route-optimizations/{id}/reject": { post: op("rejectRouteOptimization") },
    "/api/v1/route-providers/health": { get: op("getRouteProviderHealth") },
    "/api/v1/route-plans/generate": { post: op("generateRoutePlan") },
    "/api/v1/route-plans/{id}": { get: op("getRoutePlan") },
    "/api/v1/route-plans/{id}/replan": { post: op("replanRoutePlan") },
    "/api/v1/route-versions/{id}": { get: op("getRouteVersion") },
    "/api/v1/route-versions/{id}/validate": { post: op("validateRouteVersion") },
    "/api/v1/route-versions/{id}/ready": { post: op("readyRouteVersion") },
    "/api/v1/route-versions/{id}/publish": { post: op("publishRouteVersion") },
    "/api/v1/route-versions/{versionId}/stops/{stopId}/move": { post: op("movePlannedStop") },
    "/api/v1/route-versions/{versionId}/stops/{stopId}/unassign": {
      post: op("unassignPlannedStop")
    },
    "/api/v1/route-versions/{versionId}/unassigned/{unassignedId}/assign": {
      post: op("assignUnassignedService")
    },
    "/api/v1/route-versions/{versionId}/routes/{routeId}/start-time": {
      post: op("updatePlannedStartTime")
    }
  };
}
