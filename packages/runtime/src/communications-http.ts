import { IDEMPOTENCY_KEY_HEADER, type ApiErrorCode } from "@megabin/api-client";
import type {
  CommunicationChannel,
  MessagingProviderAdapter,
  MessagingResult
} from "@megabin/integrations";
import { z, ZodError } from "zod";

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
  readonly environment: "local" | "staging" | "production";
  readonly mode: "capture" | "test" | "live";
  readonly provider: MessagingProviderAdapter;
  readonly testRecipientAllowlist: readonly string[];
  readonly webhookSecret?: string;
  readonly maxRetries?: number;
  readonly defer: (work: Promise<unknown>) => void;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (code: ApiErrorCode, message: string, status: number, cid: string) =>
  json({ ok: false, error: { code, message, correlationId: cid } }, status);
const camel = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [
            k.replace(/_([a-z])/g, (_m, l: string) => l.toUpperCase()),
            camel(v)
          ])
        )
      : value;

const intentSchema = z
  .object({
    communicationType: z.enum([
      "collection_reminder",
      "route_change_notice",
      "financial_notice",
      "general_service_notice",
      "test_message"
    ]),
    clientId: z.string().uuid(),
    clientServiceId: z.string().uuid().optional(),
    sourceDomain: z.string().min(2).max(80),
    sourceReference: z.string().min(1).max(160),
    templateKey: z.string().min(1).max(100),
    templateVersion: z.number().int().positive().default(1),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    scheduledAt: z.string().datetime().optional(),
    variables: z.record(z.string(), z.string().max(300))
  })
  .strict();
const allowedVariables: Record<string, readonly string[]> = {
  test_message: ["clientName"],
  collection_reminder: ["clientName", "collectionDate", "serviceAddress"],
  route_change_notice: ["serviceNotice"],
  financial_notice: ["clientName", "safeFinancialNotice"],
  general_service_notice: ["clientName", "serviceNotice"],
  skip_approved: ["clientName", "collectionDate"],
  skip_rejected: ["clientName"]
};
const templates: Record<string, { subject?: string; body: string }> = {
  test_message: {
    subject: "MegaBin test message",
    body: "Hello {{clientName}}. This is a MegaBin test message."
  },
  collection_reminder: {
    body: "Hello {{clientName}}. Collection is planned for {{collectionDate}} at {{serviceAddress}}."
  },
  route_change_notice: { body: "MegaBin service update: {{serviceNotice}}" },
  financial_notice: {
    subject: "MegaBin account notice",
    body: "Hello {{clientName}}. {{safeFinancialNotice}}"
  },
  general_service_notice: { body: "Hello {{clientName}}. {{serviceNotice}}" },
  skip_approved: {
    subject: "MegaBin collection SKIP confirmed",
    body: "Hello {{clientName}}. Your MegaBin collection for {{collectionDate}} has been skipped as requested."
  },
  skip_rejected: {
    subject: "MegaBin SKIP request update",
    body: "Hello {{clientName}}. We could not apply your MegaBin SKIP request. Our Office team can assist."
  }
};
export function renderCommunicationTemplate(
  key: string,
  channel: CommunicationChannel,
  variables: Readonly<Record<string, string>>
) {
  const contract = allowedVariables[key];
  const template = templates[key];
  if (!contract || !template) throw new TypeError("Unknown communication template.");
  if (Object.keys(variables).some((name) => !contract.includes(name)))
    throw new TypeError("Unsupported template variable.");
  if (contract.some((name) => !variables[name])) throw new TypeError("Missing template variable.");
  const substitute = (value: string) =>
    value.replace(/{{([A-Za-z]+)}}/g, (_match, name: string) => variables[name] ?? "");
  return {
    body: substitute(template.body),
    ...(channel === "email"
      ? {
          subject: substitute(
            template.subject ??
              (() => {
                throw new TypeError("Email subject required.");
              })()
          )
        }
      : {})
  };
}

const record = async (
  deps: Dependencies,
  intentId: string,
  channel: CommunicationChannel,
  recipient: Record<string, unknown>,
  rendered: { body: string; subject?: string },
  result: MessagingResult,
  correlationId: string,
  retry = 0
) =>
  deps.rpc.rpc("communication_record_attempt", {
    p_intent: intentId,
    p_channel: channel,
    p_provider: deps.provider.providerKey,
    p_recipient: recipient,
    p_subject: rendered.subject ?? null,
    p_body: rendered.body,
    p_status: result.ok
      ? "accepted"
      : result.classification === "temporary" || result.classification === "rate_limited"
        ? "failed_temporary"
        : "failed_permanent",
    p_provider_message: result.ok ? result.providerMessageId : null,
    p_failure: result.ok ? null : result.classification,
    p_retry: retry,
    p_correlation: correlationId
  });

async function dispatch(deps: Dependencies, data: Record<string, unknown>, correlationId: string) {
  const eligibility = data.eligibility as Record<string, unknown>;
  const channels = eligibility.eligibleChannels as CommunicationChannel[];
  const variables = data.variables as Record<string, string>;
  for (const channel of channels) {
    const destination =
      channel === "email" ? String(eligibility.email ?? "") : String(eligibility.mobile ?? "");
    const rendered = renderCommunicationTemplate(String(data.templateKey), channel, variables);
    const recipient = {
      contactId: eligibility.contactId,
      language: eligibility.language,
      channel,
      destination: deps.environment === "production" ? destination : "protected-test-recipient"
    };
    if (
      deps.environment !== "production" &&
      deps.mode !== "capture" &&
      !deps.testRecipientAllowlist.includes(destination)
    ) {
      await record(
        deps,
        String(data.communicationIntentId),
        channel,
        recipient,
        rendered,
        {
          ok: false,
          classification: "invalid_destination",
          safeMessage: "Non-production recipient is not allowlisted."
        },
        correlationId
      );
      continue;
    }
    if (deps.mode === "capture") {
      await record(
        deps,
        String(data.communicationIntentId),
        channel,
        recipient,
        rendered,
        {
          ok: true,
          providerMessageId: `capture-${deps.id()}`,
          status: "accepted"
        },
        correlationId
      );
      return;
    }
    let result: MessagingResult;
    for (let retry = 0; ; retry++) {
      result = await deps.provider.send(
        {
          channel,
          destination,
          ...rendered,
          templateKey: String(data.templateKey),
          templateVersion: Number(data.templateVersion)
        },
        `${data.communicationIntentId}:${channel}:${retry}`
      );
      await record(
        deps,
        String(data.communicationIntentId),
        channel,
        recipient,
        rendered,
        result,
        correlationId,
        retry
      );
      if (
        result.ok ||
        !["temporary", "rate_limited"].includes(result.classification) ||
        retry >= (deps.maxRetries ?? 2)
      )
        break;
    }
    if (result.ok) return;
    if (["temporary", "rate_limited", "authentication"].includes(result.classification)) return;
  }
  await deps.rpc.rpc("communication_fail_intent", {
    p_intent: data.communicationIntentId,
    p_classification: channels.length === 0 ? "no_eligible_channel" : "fallback_exhausted",
    p_correlation: correlationId
  });
}

export function createCommunicationsHandler(deps: Dependencies) {
  if (deps.mode === "live" && deps.environment !== "production")
    throw new TypeError("Live communications mode is permitted only in production.");
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url),
      path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/communications") && !path.startsWith("/integrations/communications"))
      return null;
    const cid = request.headers.get("X-Correlation-Id") ?? deps.id();
    const run = async (name: string, params: Record<string, unknown>) => {
      const result = await deps.rpc.rpc(name, params);
      if (!result.error) return json({ ok: true, data: camel(result.data) });
      if (result.error.code === "42501")
        return fail("permission_denied", "Permission denied.", 403, cid);
      if (result.error.code === "P0002")
        return fail("not_found", "Communication resource not found.", 404, cid);
      if (["22023", "55000"].includes(result.error.code ?? ""))
        return fail(
          "conflict",
          result.error.message.split("\n")[0] ?? "Communication conflict.",
          409,
          cid
        );
      return fail("internal_error", "Communication operation failed.", 500, cid);
    };
    try {
      const webhook = path.startsWith("/integrations/communications/");
      if (webhook) {
        if (
          !deps.webhookSecret ||
          request.headers.get("X-Communications-Webhook-Secret") !== deps.webhookSecret
        )
          return fail("authentication_required", "Webhook authentication failed.", 401, cid);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 65536)
          return fail("validation_failed", "Webhook payload too large.", 413, cid);
        const payload: unknown = JSON.parse(raw);
        if (path.endsWith("/delivery") && request.method === "POST") {
          const callback = deps.provider.normalizeDeliveryCallback(payload);
          return run("communication_delivery_callback", {
            p_provider: deps.provider.providerKey,
            p_message: callback.providerMessageId,
            p_status: callback.status,
            p_occurred: callback.occurredAt
          });
        }
        if (path.endsWith("/inbound") && request.method === "POST") {
          const inbound = deps.provider.normalizeInbound(payload);
          return run("communication_ingest_inbound", {
            p_provider: deps.provider.providerKey,
            p_channel: inbound.channel,
            p_message: inbound.providerMessageId,
            p_sender: inbound.sender,
            p_received: inbound.receivedAt,
            p_content: inbound.text,
            p_correlation: cid
          });
        }
      }
      if (!deps.actorId)
        return fail("authentication_required", "Authentication is required.", 401, cid);
      if (path === "/communications/intents" && request.method === "GET")
        return run("communication_list", {
          p_actor: deps.actorId,
          p_query: Object.fromEntries(url.searchParams)
        });
      if (path === "/communications/inbound" && request.method === "GET")
        return run("communication_inbound_list", { p_actor: deps.actorId });
      if (path === "/communications/templates" && request.method === "GET")
        return run("communication_templates", { p_actor: deps.actorId });
      if (path === "/communications/provider-health" && request.method === "GET") {
        const database = await deps.rpc.rpc("communication_health", { p_actor: deps.actorId });
        if (database.error) return run("communication_health", { p_actor: deps.actorId });
        return json({
          ok: true,
          data: { database: camel(database.data), adapter: await deps.provider.health() }
        });
      }
      const templateTransition = /^\/communications\/templates\/([0-9a-f-]+)\/status$/.exec(path);
      if (templateTransition && request.method === "PUT") {
        const body = z
          .object({
            status: z.enum(["approved", "active", "retired"]),
            reason: z.string().min(3)
          })
          .strict()
          .parse(await request.json());
        return run("communication_template_transition", {
          p_actor: deps.actorId,
          p_template: templateTransition[1],
          p_status: body.status,
          p_reason: body.reason,
          p_correlation: cid
        });
      }
      const inboundReview = /^\/communications\/inbound\/([0-9a-f-]+)\/review$/.exec(path);
      if (inboundReview && request.method === "POST") {
        const body = z
          .object({
            status: z.enum(["processed", "ignored", "needs_review"]),
            reason: z.string().min(3)
          })
          .strict()
          .parse(await request.json());
        return run("communication_inbound_review", {
          p_actor: deps.actorId,
          p_inbound: inboundReview[1],
          p_status: body.status,
          p_reason: body.reason,
          p_correlation: cid
        });
      }
      if (
        (path === "/communications/intents" || path === "/communications/test-send") &&
        request.method === "POST"
      ) {
        const idempotency = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        if (!idempotency)
          return fail("validation_failed", "Idempotency-Key is required.", 400, cid);
        const body = intentSchema.parse(await request.json());
        if (path.endsWith("test-send") && body.communicationType !== "test_message")
          return fail("validation_failed", "Test send requires test_message.", 400, cid);
        const result = await deps.rpc.rpc("communication_create_intent", {
          p_actor: deps.actorId,
          p_body: body,
          p_correlation: cid,
          p_idempotency: idempotency
        });
        if (result.error)
          return run("communication_create_intent", {
            p_actor: deps.actorId,
            p_body: body,
            p_correlation: cid,
            p_idempotency: idempotency
          });
        const data = camel(result.data) as Record<string, unknown>;
        deps.defer(dispatch(deps, data, cid));
        return json({ ok: true, data }, 202);
      }
      const cancel = /^\/communications\/intents\/([0-9a-f-]+)\/cancel$/.exec(path);
      if (cancel && request.method === "POST") {
        const body = z
          .object({ reason: z.string().min(3) })
          .strict()
          .parse(await request.json());
        return run("communication_cancel", {
          p_actor: deps.actorId,
          p_intent: cancel[1],
          p_reason: body.reason,
          p_correlation: cid
        });
      }
      return fail("not_found", "Endpoint not found.", 404, cid);
    } catch (error) {
      return error instanceof ZodError || error instanceof TypeError || error instanceof SyntaxError
        ? fail("validation_failed", "Invalid communications request.", 400, cid)
        : fail("internal_error", "Communication operation failed.", 500, cid);
    }
  };
}
export const communicationsOpenApiPaths = {
  "/api/v1/communications/intents": {
    get: { operationId: "listCommunicationIntents" },
    post: { operationId: "createCommunicationIntent" }
  },
  "/api/v1/communications/test-send": { post: { operationId: "requestCommunicationTestSend" } },
  "/api/v1/communications/intents/{intentId}/cancel": {
    post: { operationId: "cancelCommunicationIntent" }
  },
  "/api/v1/communications/templates": { get: { operationId: "listCommunicationTemplates" } },
  "/api/v1/communications/templates/{templateId}/status": {
    put: { operationId: "transitionCommunicationTemplate" }
  },
  "/api/v1/communications/provider-health": {
    get: { operationId: "getCommunicationsProviderHealth" }
  },
  "/api/v1/communications/inbound": { get: { operationId: "listInboundMessages" } },
  "/api/v1/communications/inbound/{inboundMessageId}/review": {
    post: { operationId: "reviewInboundMessage" }
  },
  "/api/v1/integrations/communications/delivery": {
    post: {
      operationId: "receiveCommunicationDeliveryCallback",
      security: [{ integrationSecret: [] }]
    }
  },
  "/api/v1/integrations/communications/inbound": {
    post: { operationId: "receiveInboundCommunication", security: [{ integrationSecret: [] }] }
  }
} as const;
