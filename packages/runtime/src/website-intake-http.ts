import type { ApiErrorCode } from "@megabin/api-client";
import { z, ZodError } from "zod";

interface RpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

interface Dependencies {
  readonly rpc: RpcClient;
  readonly actorId: string | null;
  readonly id: () => string;
  readonly integrationKey: string;
  readonly integrationSecret?: string;
  readonly allowIntegrationRoutes?: boolean;
  readonly defer?: (work: Promise<unknown>) => void;
}

const payload = z
  .object({
    sourceSubmissionId: z.string().trim().min(1).max(200),
    payloadVersion: z.literal("1.0"),
    submittedAt: z.string().datetime({ offset: true }),
    client: z
      .object({
        type: z.enum(["individual", "organisation"]),
        displayName: z.string().trim().min(1).max(200),
        organisationName: z.string().trim().max(200).optional(),
        registrationNumber: z.string().trim().max(100).optional()
      })
      .strict(),
    contact: z
      .object({
        name: z.string().trim().min(1).max(160),
        mobile: z.string().trim().max(30).optional(),
        email: z.string().trim().email().max(254).optional(),
        preferredLanguage: z.enum(["english", "afrikaans"]).optional()
      })
      .strict()
      .refine((value) => value.mobile || value.email, "Mobile or email is required."),
    address: z
      .object({
        addressLine1: z.string().trim().min(1).max(250),
        addressLine2: z.string().trim().max(250).optional(),
        suburb: z.string().trim().min(1).max(120),
        city: z.string().trim().min(1).max(120),
        postalCode: z.string().trim().max(20).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional()
      })
      .strict()
      .refine(
        (value) => (value.latitude === undefined) === (value.longitude === undefined),
        "Latitude and longitude must be supplied together."
      ),
    requestedDrumCount: z.number().int().positive().max(1000),
    requestedStartDate: z.string().date().optional(),
    references: z
      .object({
        customerReference: z.string().trim().max(200).optional(),
        serviceReference: z.string().trim().max(200).optional(),
        agreementReference: z.string().trim().max(200).optional(),
        billingSignupReference: z.string().trim().max(200).optional()
      })
      .strict()
      .optional(),
    consent: z
      .object({ source: z.string().trim().min(1).max(100), capturedAt: z.string().datetime() })
      .strict()
      .optional()
  })
  .strict();

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (
  code: ApiErrorCode,
  message: string,
  status: number,
  correlationId: string,
  details?: Record<string, unknown>
) =>
  json(
    { ok: false, error: { code, message, correlationId, ...(details ? { details } : {}) } },
    status
  );

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

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function equalSecret(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([fingerprint(left), fingerprint(right)]);
  return a === b;
}

export function createWebsiteIntakeHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    const isIntegration = path.startsWith("/integrations/website/onboarding");
    const isOffice = path.startsWith("/website-intake");
    if (
      (!isIntegration && !isOffice) ||
      (isIntegration && dependencies.allowIntegrationRoutes === false)
    )
      return null;
    const correlationId = request.headers.get("X-Correlation-Id") ?? dependencies.id();
    const execute = async (name: string, parameters: Record<string, unknown>, status = 200) => {
      const result = await dependencies.rpc.rpc(name, parameters);
      if (!result.error) return json({ ok: true, data: camel(result.data) }, status);
      if (result.error.code === "42501")
        return fail("permission_denied", "Permission denied.", 403, correlationId);
      if (result.error.code === "P0002") return fail("not_found", "Not found.", 404, correlationId);
      if (result.error.code === "40001")
        return fail("conflict", "The intake was changed by another reviewer.", 409, correlationId);
      if (["23505", "28000"].includes(result.error.code ?? ""))
        return fail(
          "conflict",
          "The submission identity conflicts with prior input.",
          409,
          correlationId
        );
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
      if (isIntegration) {
        const suppliedKey = request.headers.get("X-Integration-Key") ?? "";
        const suppliedSecret = request.headers.get("X-Integration-Secret") ?? "";
        if (
          !dependencies.integrationSecret ||
          suppliedKey !== dependencies.integrationKey ||
          !(await equalSecret(suppliedSecret, dependencies.integrationSecret))
        )
          return fail(
            "authentication_required",
            "Integration authentication failed.",
            401,
            correlationId
          );
        const statusMatch = /^\/integrations\/website\/onboarding\/([^/]+)\/status$/.exec(path);
        if (statusMatch && request.method === "GET")
          return execute("website_intake_source_status", {
            p_integration_key: dependencies.integrationKey,
            p_source_submission_id: decodeURIComponent(statusMatch[1] ?? "")
          });
        if (path !== "/integrations/website/onboarding" || request.method !== "POST")
          return fail("not_found", "Endpoint not found.", 404, correlationId);
        const idempotencyKey = request.headers.get("Idempotency-Key");
        if (!idempotencyKey)
          return fail("validation_failed", "Idempotency-Key is required.", 400, correlationId);
        let source: unknown;
        try {
          source = await request.json();
        } catch {
          return fail(
            "validation_failed",
            "The request body must be valid JSON.",
            400,
            correlationId
          );
        }
        const parsed = payload.safeParse(source);
        const sourceSubmissionId =
          source && typeof source === "object"
            ? String((source as Record<string, unknown>).sourceSubmissionId ?? "invalid")
            : "invalid";
        const requestFingerprint = await fingerprint(source);
        if (!parsed.success) {
          const retainedPayload = {
            ...(source && typeof source === "object" ? (source as Record<string, unknown>) : {}),
            sourceSubmissionId,
            payloadVersion:
              source && typeof source === "object"
                ? String((source as Record<string, unknown>).payloadVersion ?? "1.0")
                : "1.0",
            submittedAt: (() => {
              const value =
                source && typeof source === "object"
                  ? String((source as Record<string, unknown>).submittedAt ?? "")
                  : "";
              return Number.isNaN(Date.parse(value)) ? new Date().toISOString() : value;
            })(),
            requestedDrumCount:
              source && typeof source === "object"
                ? Number((source as Record<string, unknown>).requestedDrumCount ?? 0)
                : 0
          };
          const retained = await execute(
            "website_intake_receive",
            {
              p_integration_key: dependencies.integrationKey,
              p_source_submission_id: sourceSubmissionId,
              p_idempotency_key: idempotencyKey,
              p_fingerprint: requestFingerprint,
              p_correlation_id: correlationId,
              p_payload: retainedPayload
            },
            202
          );
          if (retained.status >= 400) return retained;
          return fail(
            "validation_failed",
            "The submission is invalid and was retained.",
            422,
            correlationId,
            {
              issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                code: issue.code
              }))
            }
          );
        }
        const received = await dependencies.rpc.rpc("website_intake_receive", {
          p_integration_key: dependencies.integrationKey,
          p_source_submission_id: parsed.data.sourceSubmissionId,
          p_idempotency_key: idempotencyKey,
          p_fingerprint: requestFingerprint,
          p_correlation_id: correlationId,
          p_payload: parsed.data
        });
        if (received.error)
          return received.error.code === "23505"
            ? fail(
                "conflict",
                "The submission identity conflicts with prior input.",
                409,
                correlationId
              )
            : fail("internal_error", "The request could not be completed.", 500, correlationId);
        const result = camel(received.data) as { submissionId?: string; duplicate?: boolean };
        if (!result.duplicate && result.submissionId && dependencies.defer)
          dependencies.defer(
            dependencies.rpc.rpc("website_intake_process", {
              p_submission_id: result.submissionId,
              p_correlation_id: correlationId
            })
          );
        return json({ ok: true, data: result }, result.duplicate ? 200 : 202);
      }
      if (!dependencies.actorId)
        return fail("authentication_required", "Authentication is required.", 401, correlationId);
      if (request.method === "POST" && !request.headers.get("Idempotency-Key"))
        return fail("validation_failed", "Idempotency-Key is required.", 400, correlationId);
      if (path === "/website-intake" && request.method === "GET")
        return execute("website_intake_list", {
          p_actor_id: dependencies.actorId,
          p_query: Object.fromEntries(url.searchParams)
        });
      const detail = /^\/website-intake\/([0-9a-f-]+)$/.exec(path);
      if (detail && request.method === "GET")
        return execute("website_intake_detail", {
          p_actor_id: dependencies.actorId,
          p_submission_id: detail[1]
        });
      const action = /^\/website-intake\/([0-9a-f-]+)\/(review|approve|reject|activate)$/.exec(
        path
      );
      if (action && request.method === "POST") {
        const body = z
          .object({
            expectedVersion: z.number().int().positive(),
            decision: z.record(z.string(), z.unknown()).optional(),
            reason: z.string().trim().min(3).max(1000).optional()
          })
          .strict()
          .parse(await request.json());
        return action[2] === "activate"
          ? execute("website_intake_activate", {
              p_actor_id: dependencies.actorId,
              p_submission_id: action[1],
              p_expected_version: body.expectedVersion,
              p_correlation_id: correlationId
            })
          : execute("website_intake_review", {
              p_actor_id: dependencies.actorId,
              p_submission_id: action[1],
              p_action: action[2],
              p_expected_version: body.expectedVersion,
              p_decision: body.decision ?? null,
              p_reason: body.reason ?? null,
              p_correlation_id: correlationId
            });
      }
      return fail("not_found", "Endpoint not found.", 404, correlationId);
    } catch (error) {
      return error instanceof ZodError
        ? fail("validation_failed", "The request body is invalid.", 400, correlationId)
        : fail("internal_error", "The request could not be completed.", 500, correlationId);
    }
  };
}

export const websiteIntakeOpenApiPaths = {
  "/api/v1/integrations/website/onboarding": {
    post: { operationId: "submitWebsiteOnboarding", security: [{ integrationSecret: [] }] }
  },
  "/api/v1/integrations/website/onboarding/{sourceSubmissionId}/status": {
    get: { operationId: "getWebsiteOnboardingStatus", security: [{ integrationSecret: [] }] }
  },
  "/api/v1/website-intake": { get: { operationId: "listWebsiteIntake" } },
  "/api/v1/website-intake/{submissionId}": { get: { operationId: "getWebsiteIntake" } },
  "/api/v1/website-intake/{submissionId}/{action}": {
    post: { operationId: "actOnWebsiteIntake" }
  }
};
