import {
  API_BASE_PATH,
  CORRELATION_ID_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  type ApiErrorCode
} from "@megabin/api-client";
import { evaluateFeatureFlag } from "@megabin/config";
import { createLogRecord } from "@megabin/observability";

import { loadRuntimeConfiguration } from "./configuration.js";
import type { RuntimeDependencies } from "./contracts.js";
import { ForcedRollbackError, RuntimeError } from "./errors.js";
import { masterDataOpenApiPaths } from "./master-data-http.js";
import { geographyOpenApiPaths } from "./geography-http.js";
import { rosterOpenApiPaths } from "./roster-http.js";
import { routeOpenApiPaths } from "./routes-http.js";
import { routeOperationsOpenApiPaths } from "./route-operations-http.js";
import { vehicleTrackingOpenApiPaths } from "./vehicle-tracking-http.js";
import { liveOperationsOpenApiPaths } from "./live-operations-http.js";
import { websiteIntakeOpenApiPaths } from "./website-intake-http.js";
import { clientMigrationOpenApiPaths } from "./client-migration-http.js";
import { accountingOpenApiPaths } from "./accounting-http.js";
import { financialEligibilityOpenApiPaths } from "./financial-eligibility-http.js";
import { communicationsOpenApiPaths } from "./communications-http.js";
import { clientSkipOpenApiPaths } from "./client-skip-http.js";

interface ProofBody {
  readonly value: string;
  readonly forceRollback: boolean;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function parseProofBody(request: Request): Promise<ProofBody> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RuntimeError("validation_failed", "The request body must be valid JSON.", 400);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new RuntimeError("validation_failed", "The request body must be an object.", 400);
  }
  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate.value !== "string" ||
    candidate.value.trim().length === 0 ||
    candidate.value.length > 100
  ) {
    throw new RuntimeError(
      "validation_failed",
      "value must be a non-empty string of at most 100 characters.",
      400
    );
  }
  if (candidate.forceRollback !== undefined && typeof candidate.forceRollback !== "boolean") {
    throw new RuntimeError("validation_failed", "forceRollback must be boolean.", 400);
  }
  return { value: candidate.value, forceRollback: candidate.forceRollback === true };
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function routePath(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const apiIndex = pathname.indexOf(API_BASE_PATH);
  return apiIndex === -1 ? pathname : pathname.slice(apiIndex);
}

export function createRuntimeHandler(
  dependencies: RuntimeDependencies
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const path = routePath(request);
    if (request.method === "GET" && path === `${API_BASE_PATH}/health/live`) {
      return json({ status: "healthy", runtime: dependencies.runtime });
    }
    if (request.method === "GET" && path === `${API_BASE_PATH}/openapi.json`) {
      return json(createOpenApiDocument());
    }
    if (
      request.method === "GET" &&
      (path === `${API_BASE_PATH}/health/ready` || path === `${API_BASE_PATH}/health`)
    ) {
      return healthResponse(dependencies, path.endsWith("/ready"));
    }
    if (request.method !== "POST" || path !== `${API_BASE_PATH}/platform-proof`) {
      return errorResponse(
        "not_found",
        "The requested endpoint does not exist.",
        404,
        dependencies.id()
      );
    }

    const correlationId = request.headers.get(CORRELATION_ID_HEADER) ?? dependencies.id();
    const requestId = dependencies.id();
    try {
      if (dependencies.environment === "production") {
        throw new RuntimeError("not_found", "The requested endpoint does not exist.", 404);
      }
      const actor = await dependencies.authenticator.authenticate(request);
      if (!actor) {
        throw new RuntimeError("authentication_required", "Authentication is required.", 401);
      }
      if (!(await dependencies.authorizer.isAllowed(actor, "platform_proof.execute"))) {
        throw new RuntimeError("permission_denied", "Permission denied.", 403);
      }

      const settings = await loadRuntimeConfiguration(
        dependencies.database,
        dependencies.environment
      );
      const flag = await dependencies.database.loadFeatureFlag("runtime.platform-proof");
      if (!settings.proofEnabled || !evaluateFeatureFlag(flag, dependencies.flagContext(actor))) {
        throw new RuntimeError("not_found", "The requested endpoint does not exist.", 404);
      }

      const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
      if (!idempotencyKey) {
        throw new RuntimeError("validation_failed", "Idempotency-Key is required.", 400);
      }
      const body = await parseProofBody(request);
      const commandId = dependencies.id();
      dependencies.logs.write(
        createLogRecord({
          timestamp: dependencies.now(),
          level: "info",
          message: "Synthetic command accepted by API boundary.",
          trace: { correlationId, requestId },
          runtime: dependencies.runtime,
          metadata: { commandId, actorKind: actor.kind }
        })
      );
      const result = await dependencies.database.executePlatformProof({
        commandId,
        actorId: actor.id,
        idempotencyKey,
        requestFingerprint: await fingerprint(body),
        correlationId,
        value: body.value,
        forceRollback: body.forceRollback
      });
      dependencies.logs.write(
        createLogRecord({
          timestamp: dependencies.now(),
          level: "info",
          message: "Synthetic transaction committed with outbox event.",
          trace: { correlationId, requestId, causationId: commandId, eventId: result.eventId },
          runtime: dependencies.runtime,
          metadata: { duplicate: result.duplicate }
        })
      );
      return json({ ok: true, data: result }, result.duplicate ? 200 : 201);
    } catch (error) {
      if (error instanceof RuntimeError) {
        return errorResponse(error.code, error.message, error.status, correlationId);
      }
      const errorId = dependencies.id();
      dependencies.logs.write(
        createLogRecord({
          timestamp: dependencies.now(),
          level: "error",
          message:
            error instanceof ForcedRollbackError
              ? "Synthetic transaction rolled back."
              : "Unexpected runtime failure.",
          trace: { correlationId, requestId },
          runtime: dependencies.runtime,
          metadata: { errorId, secret: "must-redact" }
        })
      );
      return errorResponse(
        "internal_error",
        "The request could not be completed.",
        500,
        correlationId,
        errorId
      );
    }
  };
}

async function healthResponse(
  dependencies: RuntimeDependencies,
  readinessOnly: boolean
): Promise<Response> {
  const [database, outbox, jobs, integration] = await Promise.all([
    dependencies.database.health(),
    dependencies.database.outboxHealth(),
    dependencies.jobs.health(),
    dependencies.adapter.healthCheck()
  ]);
  let configuration: "healthy" | "unhealthy" = "healthy";
  try {
    await loadRuntimeConfiguration(dependencies.database, dependencies.environment);
  } catch {
    configuration = "unhealthy";
  }
  const components = { database, outbox, jobs, integration, configuration };
  const ready = database.status === "healthy" && configuration === "healthy";
  return json(
    readinessOnly
      ? { status: ready ? "healthy" : "unhealthy", runtime: dependencies.runtime }
      : {
          status: ready && outbox.status !== "unhealthy" ? "healthy" : "degraded",
          runtime: dependencies.runtime,
          components
        },
    readinessOnly && !ready ? 503 : 200
  );
}

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  correlationId: string,
  errorId?: string
): Response {
  return json(
    {
      ok: false,
      error: { code, message, correlationId, ...(errorId ? { details: { errorId } } : {}) }
    },
    status
  );
}

export function createOpenApiDocument(): Readonly<Record<string, unknown>> {
  return {
    openapi: "3.1.0",
    info: { title: "MegaBin Control Centre API", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        integrationSecret: { type: "apiKey", in: "header", name: "X-Integration-Secret" }
      }
    },
    paths: {
      ...geographyOpenApiPaths(),
      ...rosterOpenApiPaths(),
      ...routeOpenApiPaths(),
      ...routeOperationsOpenApiPaths(),
      ...vehicleTrackingOpenApiPaths,
      ...liveOperationsOpenApiPaths,
      ...websiteIntakeOpenApiPaths,
      ...clientMigrationOpenApiPaths,
      ...accountingOpenApiPaths,
      ...financialEligibilityOpenApiPaths,
      ...communicationsOpenApiPaths,
      ...clientSkipOpenApiPaths,
      ...masterDataOpenApiPaths(),
      "/api/v1/platform-proof": { post: { operationId: "executePlatformProof" } },
      "/api/v1/health/live": { get: { operationId: "getLiveness" } },
      "/api/v1/health/ready": { get: { operationId: "getReadiness" } },
      "/api/v1/health": { get: { operationId: "getPlatformHealth" } }
    }
  };
}
