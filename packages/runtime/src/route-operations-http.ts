import type { ApiErrorCode } from "@megabin/api-client";

export interface RouteOperationsRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export interface RouteOperationsHttpDependencies {
  readonly rpc: RouteOperationsRpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (code: ApiErrorCode, message: string, status: number, correlationId: string) =>
  json({ ok: false, error: { code, message, correlationId } }, status);
const camel = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
            key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
            camel(nested)
          ])
        )
      : value;

function respond(
  result: Awaited<ReturnType<RouteOperationsRpcClient["rpc"]>>,
  correlationId: string,
  status = 200
): Response {
  if (!result.error) return json({ ok: true, data: camel(result.data) }, status);
  const message = result.error.message.split("\n")[0] ?? "Route operation failed.";
  if (result.error.code === "42501")
    return fail("permission_denied", "Permission denied.", 403, correlationId);
  if (result.error.code === "P0002")
    return fail("not_found", "The route operation was not found.", 404, correlationId);
  if (result.error.code === "40001" || message === "stale_assignment_revision")
    return fail(
      "stale_assignment_revision",
      "The assignment changed. Refresh and retry.",
      409,
      correlationId
    );
  const conflicts: Readonly<Record<string, ApiErrorCode>> = {
    invalid_lifecycle_transition: "invalid_lifecycle_transition",
    operation_already_started: "operation_already_started",
    published_route_version_required: "published_route_version_required"
  };
  if (message in conflicts)
    return fail(conflicts[message] ?? "conflict", message.replaceAll("_", " "), 409, correlationId);
  if (result.error.code === "22023" || result.error.code === "55000")
    return fail("validation_failed", message, 400, correlationId);
  return fail("internal_error", "The request could not be completed.", 500, correlationId);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const value = (await request.json()) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("body");
  return value as Record<string, unknown>;
}

export function createRouteOperationsHandler(
  dependencies: RouteOperationsHttpDependencies
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/route-operations") && !path.startsWith("/driver/route-operation"))
      return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
    if (!dependencies.actorId)
      return fail("authentication_required", "Authentication is required.", 401, correlationId);
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      !request.headers.get("Idempotency-Key")
    )
      return fail("validation_failed", "Idempotency-Key is required.", 400, correlationId);
    const actor = dependencies.actorId;
    const execute = async (name: string, parameters: Record<string, unknown>, status = 200) =>
      respond(await dependencies.rpc.rpc(name, parameters), correlationId, status);
    try {
      if (path === "/route-operations/handoff" && request.method === "POST") {
        const value = await body(request);
        return execute(
          "route_operations_handoff",
          {
            p_actor_id: actor,
            p_published_route_version_id: value.publishedRouteVersionId,
            p_correlation_id: correlationId
          },
          201
        );
      }
      if (path === "/route-operations" && request.method === "GET")
        return execute("route_operations_list", {
          p_actor_id: actor,
          p_service_region_id: url.searchParams.get("serviceRegionId"),
          p_service_date: url.searchParams.get("serviceDate")
        });
      if (path === "/driver/route-operations" && request.method === "GET")
        return execute("driver_route_operations_current", { p_actor_id: actor });
      let match = /^\/driver\/route-operations\/([0-9a-f-]+)\/(manifest|freshness|actions)$/.exec(
        path
      );
      if (match) {
        if (match[2] === "manifest" && request.method === "GET")
          return execute("driver_route_operation_manifest", {
            p_actor_id: actor,
            p_route_operation_id: match[1],
            p_device_id: url.searchParams.get("deviceId")
          });
        if (match[2] === "freshness" && request.method === "GET")
          return execute("driver_route_operation_freshness", {
            p_actor_id: actor,
            p_route_operation_id: match[1],
            p_local_manifest_revision: Number(url.searchParams.get("manifestRevision")),
            p_device_id: url.searchParams.get("deviceId")
          });
        if (match[2] === "actions" && request.method === "POST") {
          const value = await body(request);
          if (value.routeOperationId !== match[1])
            return fail(
              "validation_failed",
              "Route operation identity does not match the path.",
              400,
              correlationId
            );
          if (value.idempotencyKey !== request.headers.get("Idempotency-Key"))
            return fail(
              "validation_failed",
              "Offline and HTTP idempotency keys must match.",
              400,
              correlationId
            );
          return execute("driver_route_operation_action", {
            p_actor_id: actor,
            p_route_operation_id: match[1],
            p_action: value
          });
        }
      }
      match = /^\/driver\/route-operation-actions\/([0-9a-f-]+)$/.exec(path);
      if (match && request.method === "GET")
        return execute("driver_route_operation_action_receipt", {
          p_actor_id: actor,
          p_action_id: match[1]
        });
      match =
        /^\/route-operations\/([0-9a-f-]+)(?:\/(reassign|supersede|cancel|assignment-history))?$/.exec(
          path
        );
      if (match) {
        if (!match[2] && request.method === "GET")
          return execute("route_operation_get", {
            p_actor_id: actor,
            p_route_operation_id: match[1]
          });
        if (match[2] === "assignment-history" && request.method === "GET")
          return execute("route_operation_assignment_history", {
            p_actor_id: actor,
            p_route_operation_id: match[1]
          });
        if (request.method === "POST") {
          const value = await body(request);
          if (match[2] === "reassign")
            return execute("route_operation_reassign", {
              p_actor_id: actor,
              p_route_operation_id: match[1],
              p_expected_assignment_revision: value.expectedAssignmentRevision,
              p_team_id: value.teamId,
              p_vehicle_id: value.vehicleId,
              p_staff_ids: value.staffIds,
              p_device_id: value.deviceId ?? null,
              p_reason: value.reason,
              p_correlation_id: correlationId
            });
          if (match[2] === "supersede")
            return execute("route_operation_supersede", {
              p_actor_id: actor,
              p_route_operation_id: match[1],
              p_replacement_operation_id: value.replacementOperationId,
              p_reason: value.reason,
              p_correlation_id: correlationId
            });
          if (match[2] === "cancel")
            return execute("route_operation_cancel", {
              p_actor_id: actor,
              p_route_operation_id: match[1],
              p_reason: value.reason,
              p_correlation_id: correlationId
            });
        }
      }
      return fail("not_found", "The requested endpoint does not exist.", 404, correlationId);
    } catch {
      return fail("validation_failed", "The request body is invalid.", 400, correlationId);
    }
  };
}

export function routeOperationsOpenApiPaths(): Readonly<Record<string, unknown>> {
  return {
    "/api/v1/route-operations/handoff": { post: { operationId: "handoffPublishedRoute" } },
    "/api/v1/route-operations": { get: { operationId: "listRouteOperations" } },
    "/api/v1/route-operations/{routeOperationId}": { get: { operationId: "getRouteOperation" } },
    "/api/v1/route-operations/{routeOperationId}/reassign": {
      post: { operationId: "reassignRouteOperation" }
    },
    "/api/v1/route-operations/{routeOperationId}/supersede": {
      post: { operationId: "supersedeRouteOperation" }
    },
    "/api/v1/route-operations/{routeOperationId}/cancel": {
      post: { operationId: "cancelRouteOperation" }
    },
    "/api/v1/route-operations/{routeOperationId}/assignment-history": {
      get: { operationId: "getRouteOperationAssignmentHistory" }
    },
    "/api/v1/driver/route-operations": { get: { operationId: "listAssignedRouteOperations" } },
    "/api/v1/driver/route-operations/{routeOperationId}/manifest": {
      get: { operationId: "getDriverRouteManifest" }
    },
    "/api/v1/driver/route-operations/{routeOperationId}/freshness": {
      get: { operationId: "getRouteManifestFreshness" }
    },
    "/api/v1/driver/route-operations/{routeOperationId}/actions": {
      post: { operationId: "submitRouteOperationAction" }
    },
    "/api/v1/driver/route-operation-actions/{actionId}": {
      get: { operationId: "getRouteOperationActionReceipt" }
    }
  };
}
