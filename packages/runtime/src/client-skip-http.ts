import type { RuntimeRpcClient } from "./supabase.js";

export interface ClientSkipHttpDependencies {
  readonly rpc: RuntimeRpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function createClientSkipHandler(deps: ClientSkipHttpDependencies) {
  const run = async (name: string, args: Record<string, unknown>, status = 200) => {
    const result = await deps.rpc.rpc(name, args);
    if (!result.error) return json({ ok: true, data: result.data }, status);
    const code = result.error.code;
    if (code === "42501")
      return json(
        {
          ok: false,
          error: { code: "authorization_denied", message: "Client SKIP access denied." }
        },
        403
      );
    if (code === "P0002")
      return json(
        { ok: false, error: { code: "not_found", message: "Client SKIP request not found." } },
        404
      );
    if (code === "40001")
      return json(
        {
          ok: false,
          error: { code: "stale_skip_review", message: "The request changed; refresh and retry." }
        },
        409
      );
    if (["22023", "55000"].includes(code ?? ""))
      return json(
        { ok: false, error: { code: "skip_conflict", message: result.error.message } },
        409
      );
    return json(
      { ok: false, error: { code: "validation_failed", message: "Client SKIP operation failed." } },
      400
    );
  };
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/v1/client-skips")) return null;
    if (!deps.actorId)
      return json(
        {
          ok: false,
          error: { code: "authentication_required", message: "Authentication is required." }
        },
        401
      );
    const path = url.pathname.replace("/api/v1/client-skips", "") || "/";
    try {
      if (path === "/" && request.method === "GET")
        return run("client_skip_list", {
          p_actor: deps.actorId,
          p_query: Object.fromEntries(url.searchParams)
        });
      const match =
        /^\/([0-9a-f-]+)(?:\/(rematch|approve|reject|duplicate|expire|route-impact|replan|history))?$/.exec(
          path
        );
      if (!match)
        return json(
          { ok: false, error: { code: "not_found", message: "Endpoint not found." } },
          404
        );
      const requestId = match[1],
        action = match[2];
      if (!action && request.method === "GET")
        return run("client_skip_get", { p_actor: deps.actorId, p_request: requestId });
      if (action === "route-impact" && request.method === "GET")
        return run("client_skip_route_impact", { p_actor: deps.actorId, p_request: requestId });
      if (action === "history" && request.method === "GET")
        return run("client_skip_history", { p_actor: deps.actorId, p_client_service: requestId });
      const body = (await request.json()) as Record<string, unknown>;
      if (action === "rematch" && request.method === "POST")
        return run("client_skip_rematch", {
          p_actor: deps.actorId,
          p_request: requestId,
          p_service: body.clientServiceId,
          p_occurrence_date: body.collectionDate,
          p_expected_version: body.expectedVersion,
          p_reason: body.reason,
          p_correlation: deps.id()
        });
      if (action === "approve" && request.method === "POST")
        return run("client_skip_approve", {
          p_actor: deps.actorId,
          p_request: requestId,
          p_expected_version: body.expectedVersion,
          p_reason: body.reason ?? null,
          p_correlation: deps.id()
        });
      if (["reject", "duplicate", "expire"].includes(action ?? "") && request.method === "POST")
        return run("client_skip_reject", {
          p_actor: deps.actorId,
          p_request: requestId,
          p_expected_version: body.expectedVersion,
          p_action:
            action === "reject" ? "rejected" : action === "expire" ? "expired" : "duplicate",
          p_reason: body.reason,
          p_correlation: deps.id()
        });
      if (action === "replan" && request.method === "POST")
        return run(
          "client_skip_replan",
          {
            p_actor: deps.actorId,
            p_request: requestId,
            p_reason: body.reason,
            p_correlation: deps.id()
          },
          202
        );
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
    "200": { description: "Client SKIP response" },
    "202": { description: "Replan requested" },
    "403": { description: "Permission or region denied" },
    "409": { description: "Review or route conflict" }
  }
});
export const clientSkipOpenApiPaths: Record<string, unknown> = {
  "/api/v1/client-skips": { get: op("listClientSkipRequests") },
  "/api/v1/client-skips/{id}": { get: op("getClientSkipRequest") },
  "/api/v1/client-skips/{id}/rematch": { post: op("rematchClientSkipRequest") },
  "/api/v1/client-skips/{id}/approve": { post: op("approveClientSkipRequest") },
  "/api/v1/client-skips/{id}/reject": { post: op("rejectClientSkipRequest") },
  "/api/v1/client-skips/{id}/duplicate": { post: op("deduplicateClientSkipRequest") },
  "/api/v1/client-skips/{id}/expire": { post: op("expireClientSkipRequest") },
  "/api/v1/client-skips/{id}/route-impact": { get: op("getClientSkipRouteImpact") },
  "/api/v1/client-skips/{id}/replan": { post: op("replanClientSkipRequest") },
  "/api/v1/client-skips/{clientServiceId}/history": { get: op("getClientSkipHistory") }
};
