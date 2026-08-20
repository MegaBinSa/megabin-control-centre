import type { ApiErrorCode } from "@megabin/api-client";
import {
  pagination,
  resourceName,
  schemaForResource,
  updateSchemaForResource,
  type ResourceName
} from "@megabin/validation";
import { z, ZodError } from "zod";

export interface MasterDataRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export interface MasterDataHttpDependencies {
  readonly rpc: MasterDataRpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
}

function response(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function error(
  code: ApiErrorCode,
  message: string,
  status: number,
  correlationId: string,
  details?: Record<string, unknown>
): Response {
  return response(
    { ok: false, error: { code, message, correlationId, ...(details ? { details } : {}) } },
    status
  );
}
function camelToSnake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelToSnake);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      camelToSnake(item)
    ])
  );
}
function snakeToCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeToCamel);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      snakeToCamel(item)
    ])
  );
}

export function createMasterDataHandler(
  dependencies: MasterDataHttpDependencies
): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const path = new URL(request.url).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/office/profile" && request.method === "GET") {
      const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
      if (!dependencies.actorId)
        return error("authentication_required", "Authentication is required.", 401, correlationId);
      return execute(
        "office_user_context",
        { p_actor_id: dependencies.actorId },
        dependencies,
        correlationId
      );
    }
    const match = /^\/master-data\/([^/]+)(?:\/([0-9a-f-]+))?(?:\/(archive))?$/.exec(path);
    if (!match) return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
    if (!dependencies.actorId)
      return error("authentication_required", "Authentication is required.", 401, correlationId);
    try {
      const resource = resourceName.parse(match[1]);
      const entityId = match[2];
      const action = match[3];
      if (request.method === "GET") {
        if (entityId)
          return execute(
            "master_data_get",
            { p_actor_id: dependencies.actorId, p_resource: resource, p_entity_id: entityId },
            dependencies,
            correlationId
          );
        const query = pagination.parse(Object.fromEntries(new URL(request.url).searchParams));
        return execute(
          "master_data_list",
          { p_actor_id: dependencies.actorId, p_resource: resource, p_query: camelToSnake(query) },
          dependencies,
          correlationId
        );
      }
      const idempotencyKey = request.headers.get("Idempotency-Key");
      if (!idempotencyKey)
        return error("validation_failed", "Idempotency-Key is required.", 400, correlationId);
      const raw = await request.json();
      const body =
        action === "archive"
          ? raw
          : request.method === "PATCH"
            ? updateSchemaForResource(resource).parse(raw)
            : schemaForResource(resource).parse(raw);
      const rpcName =
        action === "archive"
          ? "master_data_archive"
          : request.method === "POST"
            ? "master_data_create"
            : request.method === "PATCH"
              ? "master_data_update"
              : null;
      if (!rpcName)
        return error("not_found", "The requested endpoint does not exist.", 404, correlationId);
      return execute(
        rpcName,
        {
          p_actor_id: dependencies.actorId,
          p_resource: resource,
          p_entity_id: entityId ?? null,
          p_body: camelToSnake(body),
          p_idempotency_key: idempotencyKey,
          p_request_fingerprint: await fingerprint({ resource, entityId, rpcName, body }),
          p_correlation_id: correlationId
        },
        dependencies,
        correlationId,
        request.method === "POST" && !entityId ? 201 : 200
      );
    } catch (cause) {
      if (cause instanceof ZodError)
        return error("validation_failed", "The request is invalid.", 400, correlationId, {
          fields: cause.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        });
      return error("validation_failed", "The request body must be valid JSON.", 400, correlationId);
    }
  };
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function execute(
  name: string,
  parameters: Record<string, unknown>,
  dependencies: MasterDataHttpDependencies,
  correlationId: string,
  status = 200
): Promise<Response> {
  const { data, error: rpcError } = await dependencies.rpc.rpc(name, parameters);
  if (!rpcError) return response({ ok: true, data: snakeToCamel(data) }, status);
  const message = rpcError.message;
  if (rpcError.code === "42501")
    return error("permission_denied", "Permission denied.", 403, correlationId);
  if (rpcError.code === "P0002")
    return error("not_found", "The requested record was not found.", 404, correlationId);
  if (rpcError.code === "40001" || message.includes("stale_update"))
    return error(
      "conflict",
      "The record changed since it was loaded. Refresh and retry.",
      409,
      correlationId
    );
  if (message.includes("idempotency_key_reused"))
    return error(
      "idempotency_key_reused",
      "The idempotency key was reused for different input.",
      409,
      correlationId
    );
  if (message.includes("effective_dated_configuration_requires_new_version"))
    return error(
      "validation_failed",
      "Create a new effective-dated configuration version instead of editing history.",
      400,
      correlationId
    );
  return error("internal_error", "The request could not be completed.", 500, correlationId);
}

export function masterDataOpenApiPaths(): Record<string, unknown> {
  const resources: ResourceName[] = [
    "clients",
    "client-contacts",
    "service-addresses",
    "client-services",
    "service-configurations",
    "service-regions",
    "depots",
    "territories",
    "teams",
    "staff",
    "vehicles"
  ];
  const security = [{ bearerAuth: [] }];
  const errors = {
    "400": { description: "Validation failure" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission or region scope denied" },
    "409": { description: "Stale update or idempotency conflict" }
  };
  return Object.fromEntries(
    resources.flatMap((resource) => [
      [
        `/api/v1/master-data/${resource}`,
        {
          get: {
            operationId: `list-${resource}`,
            security,
            parameters: [
              { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
              {
                name: "pageSize",
                in: "query",
                schema: { type: "integer", minimum: 1, maximum: 100 }
              },
              { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
              { name: "serviceRegionId", in: "query", schema: { type: "string", format: "uuid" } }
            ],
            responses: { "200": { description: "Authorized page" }, ...errors }
          },
          post: {
            operationId: `create-${resource}`,
            security,
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: z.toJSONSchema(schemaForResource(resource), { io: "input" })
                }
              }
            },
            responses: { "201": { description: "Created" }, ...errors }
          }
        }
      ],
      [
        `/api/v1/master-data/${resource}/{id}`,
        {
          get: {
            operationId: `get-${resource}`,
            security,
            responses: { "200": { description: "Authorized record" }, ...errors }
          },
          patch: {
            operationId: `update-${resource}`,
            security,
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: z.toJSONSchema(updateSchemaForResource(resource), { io: "input" })
                }
              }
            },
            responses: { "200": { description: "Updated" }, ...errors }
          }
        }
      ],
      [
        `/api/v1/master-data/${resource}/{id}/archive`,
        {
          post: {
            operationId: `archive-${resource}`,
            security,
            responses: { "200": { description: "Archived or deactivated" }, ...errors }
          }
        }
      ]
    ])
  );
}
