import type { ApiErrorCode } from "@megabin/api-client";

export interface VehicleTrackingRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

interface Dependencies {
  readonly rpc: VehicleTrackingRpcClient;
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

export function createVehicleTrackingHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/vehicle-tracking") && !path.startsWith("/driver/tracking")) return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
    if (!dependencies.actorId)
      return fail("authentication_required", "Authentication is required.", 401, correlationId);
    const write = request.method === "POST";
    if (write && !request.headers.get("Idempotency-Key"))
      return fail("validation_failed", "Idempotency-Key is required.", 400, correlationId);
    const actor = dependencies.actorId;
    const body = async () => (await request.json()) as Record<string, unknown>;
    const execute = async (name: string, parameters: Record<string, unknown>, status = 200) => {
      const result = await dependencies.rpc.rpc(name, parameters);
      if (!result.error) return json({ ok: true, data: camel(result.data) }, status);
      const message = result.error.message.split("\n")[0] ?? "Tracking request failed.";
      if (result.error.code === "42501")
        return fail("permission_denied", "Permission denied.", 403, correlationId);
      if (result.error.code === "P0002") return fail("not_found", "Not found.", 404, correlationId);
      if (["22023", "55000"].includes(result.error.code ?? ""))
        return fail("validation_failed", message, 400, correlationId);
      return fail("internal_error", "The request could not be completed.", 500, correlationId);
    };
    try {
      if (path === "/driver/tracking/device" && request.method === "GET")
        return execute("vehicle_tracking_own_device", { p_actor_id: actor });
      if (path === "/driver/tracking/observations" && request.method === "POST") {
        const value = await body();
        if (!Array.isArray(value.observations) || value.observations.length > 100)
          return fail("validation_failed", "Observation batch is invalid.", 400, correlationId);
        return execute("vehicle_tracking_ingest_batch", {
          p_actor_id: actor,
          p_device_id: value.deviceId,
          p_observations: value.observations
        });
      }
      if (path === "/vehicle-tracking/devices" && request.method === "GET")
        return execute("vehicle_tracking_device_list", {
          p_actor_id: actor,
          p_region_id: url.searchParams.get("serviceRegionId")
        });
      if (path === "/vehicle-tracking/devices" && request.method === "POST")
        return execute(
          "vehicle_tracking_device_register",
          { p_actor_id: actor, p_input: await body(), p_correlation_id: correlationId },
          201
        );
      const device =
        /^\/vehicle-tracking\/devices\/([0-9a-f-]+)\/(lifecycle|assign|assignments)$/.exec(path);
      if (device?.[2] === "assignments" && request.method === "GET")
        return execute("vehicle_tracking_assignment_history", {
          p_actor_id: actor,
          p_device_id: device[1]
        });
      if (device && request.method === "POST") {
        const value = await body();
        return device[2] === "lifecycle"
          ? execute("vehicle_tracking_device_lifecycle", {
              p_actor_id: actor,
              p_device_id: device[1],
              p_target: value.target,
              p_reason: value.reason,
              p_correlation_id: correlationId
            })
          : execute("vehicle_tracking_device_assign", {
              p_actor_id: actor,
              p_device_id: device[1],
              p_vehicle_id: value.vehicleId,
              p_reason: value.reason,
              p_correlation_id: correlationId
            });
      }
      if (path === "/vehicle-tracking/positions" && request.method === "GET")
        return execute("vehicle_tracking_positions", {
          p_actor_id: actor,
          p_region_id: url.searchParams.get("serviceRegionId")
        });
      return fail("not_found", "Endpoint not found.", 404, correlationId);
    } catch {
      return fail("validation_failed", "Request body is invalid.", 400, correlationId);
    }
  };
}

export const vehicleTrackingOpenApiPaths = {
  "/api/v1/driver/tracking/device": { get: { operationId: "getOwnTrackingDevice" } },
  "/api/v1/driver/tracking/observations": { post: { operationId: "ingestTrackingBatch" } },
  "/api/v1/vehicle-tracking/devices": {
    get: { operationId: "listTrackingDevices" },
    post: { operationId: "registerTrackingDevice" }
  },
  "/api/v1/vehicle-tracking/devices/{deviceId}/lifecycle": {
    post: { operationId: "changeTrackingDeviceLifecycle" }
  },
  "/api/v1/vehicle-tracking/devices/{deviceId}/assign": {
    post: { operationId: "assignTrackingDevice" }
  },
  "/api/v1/vehicle-tracking/devices/{deviceId}/assignments": {
    get: { operationId: "getTrackingAssignmentHistory" }
  },
  "/api/v1/vehicle-tracking/positions": { get: { operationId: "listCurrentVehiclePositions" } }
};
