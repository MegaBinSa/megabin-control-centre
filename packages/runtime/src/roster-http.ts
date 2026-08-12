import type { ApiErrorCode } from "@megabin/api-client";
export interface RosterRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}
export interface RosterHttpDependencies {
  readonly rpc: RosterRpcClient;
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
          Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key.replace(/_([a-z])/g, (_m, letter: string) => letter.toUpperCase()),
            camel(item)
          ])
        )
      : value;
async function execute(
  name: string,
  parameters: Record<string, unknown>,
  deps: RosterHttpDependencies,
  correlationId: string,
  status = 200
) {
  const result = await deps.rpc.rpc(name, parameters);
  if (!result.error) return json({ ok: true, data: camel(result.data) }, status);
  const message = result.error.message;
  if (result.error.code === "42501")
    return fail("permission_denied", "Permission denied.", 403, correlationId);
  if (result.error.code === "P0002")
    return fail("not_found", "The requested record was not found.", 404, correlationId);
  if (result.error.code === "40001" || message.includes("stale_update"))
    return fail(
      "conflict",
      "The roster changed since it was loaded. Refresh and retry.",
      409,
      correlationId
    );
  if (result.error.code === "23505" || message.includes("conflict"))
    return fail(
      "conflict",
      "The resource is already assigned to another team.",
      409,
      correlationId
    );
  if (result.error.code === "22023" || result.error.code === "55000")
    return fail(
      "validation_failed",
      message.split("\n")[0] ?? "Roster validation failed.",
      400,
      correlationId
    );
  return fail("internal_error", "The request could not be completed.", 500, correlationId);
}
export function createRosterHandler(
  deps: RosterHttpDependencies
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/roster/") && !path.startsWith("/availability/")) return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? deps.id();
    if (!deps.actorId)
      return fail("authentication_required", "Authentication is required.", 401, correlationId);
    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    if (write && !request.headers.get("Idempotency-Key"))
      return fail("validation_failed", "Idempotency-Key is required.", 400, correlationId);
    const actor = deps.actorId;
    try {
      if (path === "/roster/generate" && request.method === "POST") {
        const b = (await request.json()) as Record<string, unknown>;
        return execute(
          "roster_generate",
          {
            p_actor_id: actor,
            p_service_region_id: b.serviceRegionId,
            p_service_date: b.serviceDate,
            p_correlation_id: correlationId
          },
          deps,
          correlationId,
          201
        );
      }
      if (path === "/roster/daily" && request.method === "GET")
        return execute(
          "roster_find",
          {
            p_actor_id: actor,
            p_service_region_id: url.searchParams.get("serviceRegionId"),
            p_service_date: url.searchParams.get("serviceDate")
          },
          deps,
          correlationId
        );
      let match = /^\/roster\/operational-days\/([0-9a-f-]+)(?:\/(validate|transition))?$/.exec(
        path
      );
      if (match) {
        if (!match[2] && request.method === "GET")
          return execute(
            "roster_get",
            { p_actor_id: actor, p_operational_day_id: match[1] },
            deps,
            correlationId
          );
        if (match[2] === "validate" && request.method === "POST")
          return execute(
            "roster_validate",
            { p_actor_id: actor, p_operational_day_id: match[1] },
            deps,
            correlationId
          );
        if (match[2] === "transition" && request.method === "POST") {
          const b = (await request.json()) as Record<string, unknown>;
          return execute(
            "roster_transition",
            {
              p_actor_id: actor,
              p_operational_day_id: match[1],
              p_target: b.target,
              p_expected_updated_at: b.expectedUpdatedAt,
              p_reason: b.reason ?? null,
              p_correlation_id: correlationId
            },
            deps,
            correlationId
          );
        }
      }
      match = /^\/roster\/entries\/([0-9a-f-]+)$/.exec(path);
      if (match && request.method === "PUT")
        return execute(
          "roster_update_entry",
          {
            p_actor_id: actor,
            p_entry_id: match[1],
            p_body: await request.json(),
            p_correlation_id: correlationId
          },
          deps,
          correlationId
        );
      if (path === "/availability/windows" && request.method === "GET")
        return execute(
          "availability_list",
          {
            p_actor_id: actor,
            p_service_region_id: url.searchParams.get("serviceRegionId"),
            p_from: url.searchParams.get("from"),
            p_to: url.searchParams.get("to")
          },
          deps,
          correlationId
        );
      match = /^\/availability\/(staff|vehicle)(?:\/([0-9a-f-]+))?$/.exec(path);
      if (match && ["POST", "PUT"].includes(request.method))
        return execute(
          "availability_save",
          {
            p_actor_id: actor,
            p_kind: match[1],
            p_id: match[2] ?? null,
            p_body: await request.json(),
            p_correlation_id: correlationId
          },
          deps,
          correlationId,
          match[2] ? 200 : 201
        );
      if (match && match[2] && request.method === "DELETE")
        return execute(
          "availability_delete",
          { p_actor_id: actor, p_kind: match[1], p_id: match[2], p_correlation_id: correlationId },
          deps,
          correlationId
        );
      return fail("not_found", "The requested endpoint does not exist.", 404, correlationId);
    } catch {
      return fail("validation_failed", "The request body must be valid JSON.", 400, correlationId);
    }
  };
}
export function rosterOpenApiPaths(): Record<string, unknown> {
  const op = (operationId: string) => ({
    operationId,
    security: [{ bearerAuth: [] }],
    responses: {
      "200": { description: "Successful roster response" },
      "400": { description: "Roster validation failure" },
      "403": { description: "Permission or scope denied" },
      "409": { description: "Stale or conflicting assignment" }
    }
  });
  return {
    "/api/v1/roster/generate": { post: op("generateDailyRoster") },
    "/api/v1/roster/daily": { get: op("findDailyRoster") },
    "/api/v1/roster/operational-days/{id}": { get: op("getDailyRoster") },
    "/api/v1/roster/operational-days/{id}/validate": { post: op("validateDailyRoster") },
    "/api/v1/roster/operational-days/{id}/transition": { post: op("transitionOperationalDay") },
    "/api/v1/roster/entries/{id}": { put: op("updateRosterEntry") },
    "/api/v1/availability/windows": { get: op("listAvailabilityWindows") },
    "/api/v1/availability/staff": { post: op("createStaffAvailability") },
    "/api/v1/availability/staff/{id}": {
      put: op("updateStaffAvailability"),
      delete: op("removeStaffAvailability")
    },
    "/api/v1/availability/vehicle": { post: op("createVehicleAvailability") },
    "/api/v1/availability/vehicle/{id}": {
      put: op("updateVehicleAvailability"),
      delete: op("removeVehicleAvailability")
    }
  };
}
