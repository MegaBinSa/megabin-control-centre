import type { ApiErrorCode } from "@megabin/api-client";

export interface GeographyRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}
export interface GeographyHttpDependencies {
  readonly rpc: GeographyRpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (code: ApiErrorCode, message: string, status: number, correlationId: string) =>
  json({ ok: false, error: { code, message, correlationId } }, status);
const camelToSnake = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(camelToSnake)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
            camelToSnake(item)
          ])
        )
      : value;
const snakeToCamel = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(snakeToCamel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
            snakeToCamel(item)
          ])
        )
      : value;

async function execute(
  name: string,
  parameters: Record<string, unknown>,
  dependencies: GeographyHttpDependencies,
  correlationId: string,
  status = 200
): Promise<Response> {
  const { data, error } = await dependencies.rpc.rpc(name, parameters);
  if (!error) return json({ ok: true, data: snakeToCamel(data) }, status);
  if (error.code === "42501")
    return failure("permission_denied", "Permission denied.", 403, correlationId);
  if (error.code === "P0002")
    return failure("not_found", "The requested record was not found.", 404, correlationId);
  if (error.code === "40001" || error.message.includes("stale_update"))
    return failure(
      "conflict",
      "The record changed since it was loaded. Refresh and retry.",
      409,
      correlationId
    );
  if (error.code === "22023")
    return failure(
      "validation_failed",
      error.message.split("\n")[0] ?? "Invalid geography input.",
      400,
      correlationId
    );
  return failure("internal_error", "The request could not be completed.", 500, correlationId);
}

export function createGeographyHandler(
  dependencies: GeographyHttpDependencies
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/geography/")) return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
    if (!dependencies.actorId)
      return failure("authentication_required", "Authentication is required.", 401, correlationId);
    const actor = dependencies.actorId;
    const readOnlyPost =
      path === "/geography/point-query" ||
      path.endsWith("/overlaps") ||
      path.endsWith("/impact-preview");
    const writeOperation =
      path === "/geography/territories" ||
      /^\/geography\/(territories|reviews|services|depots)\/[0-9a-f-]+(?:\/resolve|\/territory-override)?$/.test(
        path
      );
    if (
      ["POST", "PUT", "PATCH"].includes(request.method) &&
      writeOperation &&
      !readOnlyPost &&
      !request.headers.get("Idempotency-Key")
    )
      return failure("validation_failed", "Idempotency-Key is required.", 400, correlationId);
    try {
      if (path === "/geography/map" && request.method === "GET")
        return execute(
          "geography_map",
          { p_actor_id: actor, p_service_region_id: url.searchParams.get("serviceRegionId") },
          dependencies,
          correlationId
        );
      if (path === "/geography/point-query" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        return execute(
          "geography_point_query",
          {
            p_actor_id: actor,
            p_latitude: body.latitude,
            p_longitude: body.longitude,
            p_service_region_id: body.serviceRegionId ?? null
          },
          dependencies,
          correlationId
        );
      }
      if (path === "/geography/territories" && request.method === "POST")
        return execute(
          "geography_create_territory",
          { p_actor_id: actor, p_body: await request.json(), p_correlation_id: correlationId },
          dependencies,
          correlationId,
          201
        );
      let match = /^\/geography\/territories\/([0-9a-f-]+)(?:\/(overlaps|impact-preview))?$/.exec(
        path
      );
      if (match) {
        if (request.method !== (match[2] ? "POST" : "PUT"))
          return failure("not_found", "The requested endpoint does not exist.", 404, correlationId);
        const body = (await request.json()) as Record<string, unknown>;
        const action = match[2];
        return execute(
          action === "overlaps"
            ? "geography_overlap_analysis"
            : action === "impact-preview"
              ? "geography_impact_preview"
              : "geography_save_territory",
          {
            p_actor_id: actor,
            p_territory_id: match[1],
            ...(action
              ? { p_draft_geojson: body.geometry, p_priority: body.priority }
              : { p_body: camelToSnake(body), p_correlation_id: correlationId })
          },
          dependencies,
          correlationId
        );
      }
      if (path === "/geography/reviews" && request.method === "GET")
        return execute(
          "geography_reviews",
          {
            p_actor_id: actor,
            p_service_region_id: url.searchParams.get("serviceRegionId"),
            p_status: url.searchParams.get("status") ?? "open"
          },
          dependencies,
          correlationId
        );
      match = /^\/geography\/reviews\/([0-9a-f-]+)\/resolve$/.exec(path);
      if (match && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        return execute(
          "geography_resolve_review",
          {
            p_actor_id: actor,
            p_review_id: match[1],
            p_resolution: body.resolution,
            p_expected_updated_at: body.expectedUpdatedAt,
            p_correlation_id: correlationId
          },
          dependencies,
          correlationId
        );
      }
      match = /^\/geography\/services\/([0-9a-f-]+)\/territory-override$/.exec(path);
      if (match && request.method === "PUT") {
        const body = (await request.json()) as Record<string, unknown>;
        return execute(
          "geography_set_override",
          {
            p_actor_id: actor,
            p_client_service_id: match[1],
            p_territory_id: body.territoryId ?? null,
            p_remove: body.remove === true,
            p_correlation_id: correlationId
          },
          dependencies,
          correlationId
        );
      }
      match = /^\/geography\/depots\/([0-9a-f-]+)$/.exec(path);
      if (match && request.method === "PATCH")
        return execute(
          "geography_update_depot",
          {
            p_actor_id: actor,
            p_depot_id: match[1],
            p_body: await request.json(),
            p_correlation_id: correlationId
          },
          dependencies,
          correlationId
        );
      match = /^\/geography\/service-addresses\/([0-9a-f-]+)\/context$/.exec(path);
      if (match && request.method === "GET")
        return execute(
          "geography_service_context",
          { p_actor_id: actor, p_service_address_id: match[1] },
          dependencies,
          correlationId
        );
      return failure("not_found", "The requested endpoint does not exist.", 404, correlationId);
    } catch {
      return failure(
        "validation_failed",
        "The request body must be valid JSON.",
        400,
        correlationId
      );
    }
  };
}

export function geographyOpenApiPaths(): Record<string, unknown> {
  const security = [{ bearerAuth: [] }];
  const operation = (operationId: string) => ({
    operationId,
    security,
    responses: {
      "200": { description: "Successful geography response" },
      "400": { description: "Invalid geography input" },
      "401": { description: "Authentication required" },
      "403": { description: "Permission or region scope denied" },
      "409": { description: "Stale write" }
    }
  });
  return {
    "/api/v1/geography/map": { get: operation("getGeographyMap") },
    "/api/v1/geography/point-query": { post: operation("queryTerritoriesForPoint") },
    "/api/v1/geography/territories": { post: operation("createTerritoryGeometry") },
    "/api/v1/geography/territories/{id}": { put: operation("updateTerritoryGeometry") },
    "/api/v1/geography/territories/{id}/overlaps": { post: operation("analyzeTerritoryOverlap") },
    "/api/v1/geography/territories/{id}/impact-preview": {
      post: operation("previewTerritoryImpact")
    },
    "/api/v1/geography/reviews": { get: operation("listGeographyReviews") },
    "/api/v1/geography/reviews/{id}/resolve": { post: operation("resolveGeographyReview") },
    "/api/v1/geography/services/{id}/territory-override": {
      put: operation("setTerritoryOverride")
    },
    "/api/v1/geography/depots/{id}": { patch: operation("updateDepotGeography") },
    "/api/v1/geography/service-addresses/{id}/context": {
      get: operation("getServiceAddressGeography")
    }
  };
}
