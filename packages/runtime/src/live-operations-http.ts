import type { ApiErrorCode } from "@megabin/api-client";
import {
  evaluateOperationalIntelligence,
  type IntelligenceRules,
  type IntelligenceSnapshot
} from "./operational-intelligence.js";

interface RpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}
interface Dependencies {
  readonly rpc: RpcClient;
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

export function createLiveOperationsHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url),
      path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (
      !path.startsWith("/live-operations") &&
      !path.startsWith("/operational-intelligence") &&
      !path.startsWith("/needs-attention")
    )
      return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
    if (!dependencies.actorId)
      return fail("authentication_required", "Authentication is required.", 401, correlationId);
    if (request.method === "POST" && !request.headers.get("Idempotency-Key"))
      return fail("validation_failed", "Idempotency-Key is required.", 400, correlationId);
    const execute = async (name: string, parameters: Record<string, unknown>) => {
      const result = await dependencies.rpc.rpc(name, parameters);
      if (!result.error) return json({ ok: true, data: camel(result.data) });
      if (result.error.code === "42501")
        return fail("permission_denied", "Permission denied.", 403, correlationId);
      if (result.error.code === "P0002") return fail("not_found", "Not found.", 404, correlationId);
      if (["22023", "55000"].includes(result.error.code ?? ""))
        return fail(
          "validation_failed",
          result.error.message.split("\n")[0] ?? "Invalid request.",
          400,
          correlationId
        );
      return fail("internal_error", "The request could not be completed.", 500, correlationId);
    };
    try {
      const region = url.searchParams.get("serviceRegionId");
      if (path === "/live-operations" && request.method === "GET")
        return execute("live_operations_overview", {
          p_actor_id: dependencies.actorId,
          p_region_id: region
        });
      if (path === "/operational-intelligence/facts" && request.method === "GET")
        return execute("operational_facts_list", {
          p_actor_id: dependencies.actorId,
          p_region_id: region,
          p_status: url.searchParams.get("status")
        });
      if (path === "/needs-attention" && request.method === "GET")
        return execute("needs_attention_list", {
          p_actor_id: dependencies.actorId,
          p_region_id: region,
          p_status: url.searchParams.get("status")
        });
      const vehicleDetail = /^\/live-operations\/vehicles\/([0-9a-f-]+)$/.exec(path);
      if (vehicleDetail && request.method === "GET")
        return execute("live_operations_vehicle_detail", {
          p_actor_id: dependencies.actorId,
          p_vehicle_id: vehicleDetail[1]
        });
      const progressDetail = /^\/live-operations\/routes\/([0-9a-f-]+)\/progress$/.exec(path);
      if (progressDetail && request.method === "GET")
        return execute("live_route_progress_detail", {
          p_actor_id: dependencies.actorId,
          p_route_operation_id: progressDetail[1]
        });
      const factDetail = /^\/operational-intelligence\/facts\/([0-9a-f-]+)$/.exec(path);
      if (factDetail && request.method === "GET")
        return execute("operational_fact_detail", {
          p_actor_id: dependencies.actorId,
          p_fact_id: factDetail[1]
        });
      const needsDetail = /^\/needs-attention\/([0-9a-f-]+)$/.exec(path);
      if (needsDetail && request.method === "GET")
        return execute("needs_attention_detail", {
          p_actor_id: dependencies.actorId,
          p_item_id: needsDetail[1]
        });
      if (path === "/operational-intelligence/evaluate" && request.method === "POST") {
        const body = (await request.json()) as {
          snapshot: IntelligenceSnapshot;
          rules: IntelligenceRules;
        };
        const evaluated = evaluateOperationalIntelligence(body.snapshot, body.rules);
        return execute("operational_intelligence_apply", {
          p_actor_id: dependencies.actorId,
          p_region_id: body.snapshot.serviceRegionId,
          p_signals: evaluated.signals,
          p_progress: evaluated.progress,
          p_correlation_id: correlationId
        });
      }
      const review =
        /^\/operational-intelligence\/facts\/([0-9a-f-]+)\/(acknowledge|resolve|dismiss)$/.exec(
          path
        );
      if (review && request.method === "POST") {
        const body = (await request.json()) as { reason?: string };
        return execute("operational_fact_review", {
          p_actor_id: dependencies.actorId,
          p_fact_id: review[1],
          p_action: review[2],
          p_reason: body.reason ?? null,
          p_correlation_id: correlationId
        });
      }
      return fail("not_found", "Endpoint not found.", 404, correlationId);
    } catch {
      return fail("validation_failed", "Request body is invalid.", 400, correlationId);
    }
  };
}

export const liveOperationsOpenApiPaths = {
  "/api/v1/live-operations": { get: { operationId: "getLiveOperationsOverview" } },
  "/api/v1/live-operations/vehicles/{vehicleId}": {
    get: { operationId: "getLiveOperationsVehicleDetail" }
  },
  "/api/v1/live-operations/routes/{routeOperationId}/progress": {
    get: { operationId: "getLiveRouteProgress" }
  },
  "/api/v1/operational-intelligence/facts": { get: { operationId: "listOperationalFacts" } },
  "/api/v1/operational-intelligence/evaluate": {
    post: { operationId: "evaluateOperationalIntelligence" }
  },
  "/api/v1/operational-intelligence/facts/{factId}/{action}": {
    post: { operationId: "reviewOperationalFact" }
  },
  "/api/v1/operational-intelligence/facts/{factId}": {
    get: { operationId: "getOperationalFact" }
  },
  "/api/v1/needs-attention": { get: { operationId: "listNeedsAttention" } },
  "/api/v1/needs-attention/{itemId}": { get: { operationId: "getNeedsAttentionItem" } }
};
