import type { ApiErrorCode } from "@megabin/api-client";
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
    if (!path.startsWith("/route-plans") && !path.startsWith("/route-versions")) return null;
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
