import type { ApiErrorCode } from "@megabin/api-client";
import type { AccountingProviderAdapter, AccountingResult } from "@megabin/integrations";
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
  readonly provider: AccountingProviderAdapter;
  readonly organizationId: string;
  readonly defer: (work: Promise<unknown>) => void;
  readonly pageSize?: number;
  readonly maxRetryAfterMs?: number;
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
async function fingerprint(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value))
  );
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function facts<T extends object>(result: AccountingResult<{ readonly items: readonly T[] }>) {
  if (!result.ok) throw result;
  return Promise.all(
    result.value.items.map(async (item) => ({ ...item, fingerprint: await fingerprint(item) }))
  );
}
async function synchronize(deps: Dependencies, syncRunId: string, mode: string) {
  const request = {
    pageSize: deps.pageSize ?? 100,
    ...(mode === "incremental"
      ? { modifiedSince: new Date(Date.now() - 7 * 86400000).toISOString() }
      : {})
  };
  try {
    const [customers, invoices, payments, adjustments] = await Promise.all([
      deps.provider.customers(request),
      deps.provider.invoices(request),
      deps.provider.payments(request),
      deps.provider.adjustments(request)
    ]);
    const failed = [customers, invoices, payments, adjustments].find((v) => !v.ok);
    if (failed && !failed.ok) {
      await deps.rpc.rpc("accounting_fail_sync", {
        p_sync_run: syncRunId,
        p_classification: failed.classification,
        p_message: failed.safeMessage,
        p_retry_after_ms:
          failed.retryAfterMs === undefined
            ? null
            : Math.min(failed.retryAfterMs, deps.maxRetryAfterMs ?? 5000)
      });
      return;
    }
    await deps.rpc.rpc("accounting_ingest_sync", {
      p_sync_run: syncRunId,
      p_payload: {
        customers: await facts(customers),
        invoices: await facts(invoices),
        payments: await facts(payments),
        adjustments: await facts(adjustments),
        providerMetadata: {
          provider: deps.provider.providerKey,
          synthetic: deps.provider.providerKey.endsWith("-fake")
        }
      }
    });
  } catch {
    await deps.rpc.rpc("accounting_fail_sync", {
      p_sync_run: syncRunId,
      p_classification: "transient_network",
      p_message: "Accounting synchronization failed safely.",
      p_retry_after_ms: null
    });
  }
}

export function createAccountingHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url),
      path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/accounting")) return null;
    const cid = request.headers.get("X-Correlation-Id") ?? deps.id();
    if (!deps.actorId)
      return fail("authentication_required", "Authentication is required.", 401, cid);
    const respond = (result: {
      data: unknown;
      error: { code?: string; message: string } | null;
    }) => {
      if (!result.error) return json({ ok: true, data: camel(result.data) });
      if (result.error.code === "42501")
        return fail("permission_denied", "Permission denied.", 403, cid);
      if (result.error.code === "P0002")
        return fail("not_found", "Accounting resource not found.", 404, cid);
      if (
        result.error.code === "22023" &&
        result.error.message.includes("accounting_sync_idempotency_conflict")
      )
        return fail(
          "idempotency_key_reused",
          "The synchronization identity was already used for a different request.",
          409,
          cid
        );
      if (result.error.code === "55000" && result.error.message.includes("sync_running"))
        return fail("sync_running", "An accounting sync is already running.", 409, cid);
      if (["22023", "55000"].includes(result.error.code ?? ""))
        return fail(
          "reconciliation_conflict",
          result.error.message.split("\n")[0] ?? "Accounting conflict.",
          409,
          cid
        );
      return fail("internal_error", "Accounting operation failed.", 500, cid);
    };
    const run = async (name: string, p: Record<string, unknown>) =>
      respond(await deps.rpc.rpc(name, p));
    try {
      if (path === "/accounting/health" && request.method === "GET")
        return run("accounting_health", { p_actor: deps.actorId });
      if (path === "/accounting/sync-runs" && request.method === "GET")
        return run("accounting_sync_runs", { p_actor: deps.actorId });
      if (path === "/accounting/reconciliation" && request.method === "GET")
        return run("accounting_reconciliation_queue", { p_actor: deps.actorId });
      if (path === "/accounting/status" && request.method === "GET")
        return run("accounting_status_list", {
          p_actor: deps.actorId,
          p_query: Object.fromEntries(url.searchParams)
        });
      const detail = /^\/accounting\/clients\/([0-9a-f-]+)$/.exec(path);
      if (detail && request.method === "GET")
        return run("accounting_client_detail", { p_actor: deps.actorId, p_client: detail[1] });
      if (path === "/accounting/sync-runs" && request.method === "POST") {
        const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
        if (!idempotencyKey)
          return fail("validation_failed", "Idempotency-Key is required.", 400, cid);
        const body = z
          .object({
            syncMode: z.enum(["initial_full", "incremental", "manual_refresh", "scheduled"]),
            cursor: z.string().optional()
          })
          .strict()
          .parse(await request.json());
        const result = await deps.rpc.rpc("accounting_start_sync", {
          p_actor: deps.actorId,
          p_body: {
            provider: deps.provider.providerKey,
            environment: deps.environment,
            organizationId: deps.organizationId,
            syncMode: body.syncMode,
            cursor: body.cursor,
            idempotencyKey
          },
          p_correlation: cid
        });
        if (result.error) return respond(result);
        const data = camel(result.data) as {
          syncRunId: string;
          status: string;
          duplicate?: boolean;
        };
        if (!data.duplicate) deps.defer(synchronize(deps, data.syncRunId, body.syncMode));
        return json({ ok: true, data }, data.duplicate ? 200 : 202);
      }
      const reconcile = /^\/accounting\/reconciliation\/([^/]+)\/([^/]+)$/.exec(path);
      if (reconcile && request.method === "POST") {
        const b = z
          .object({
            action: z.enum(["link", "ignore", "follow_up", "resolve_conflict"]),
            clientId: z.string().uuid().nullable().optional(),
            reason: z.string().min(3)
          })
          .strict()
          .parse(await request.json());
        return run("accounting_reconcile", {
          p_actor: deps.actorId,
          p_provider: decodeURIComponent(reconcile[1] ?? ""),
          p_customer: decodeURIComponent(reconcile[2] ?? ""),
          p_action: b.action,
          p_client: b.clientId ?? null,
          p_reason: b.reason,
          p_correlation: cid
        });
      }
      const exception = /^\/accounting\/clients\/([0-9a-f-]+)\/exception$/.exec(path);
      if (exception && request.method === "PUT") {
        const b = z
          .object({
            status: z.enum(["current", "manual_review", "unknown"]),
            reason: z.string().min(3),
            effectiveUntil: z.string().datetime().nullable().optional()
          })
          .strict()
          .parse(await request.json());
        return run("accounting_set_exception", {
          p_actor: deps.actorId,
          p_client: exception[1],
          p_status: b.status,
          p_reason: b.reason,
          p_until: b.effectiveUntil ?? null,
          p_correlation: cid
        });
      }
      if (exception && request.method === "DELETE") {
        const b = z
          .object({ reason: z.string().min(3) })
          .strict()
          .parse(await request.json());
        return run("accounting_remove_exception", {
          p_actor: deps.actorId,
          p_client: exception[1],
          p_reason: b.reason,
          p_correlation: cid
        });
      }
      return fail("not_found", "Endpoint not found.", 404, cid);
    } catch (e) {
      return e instanceof ZodError
        ? fail("validation_failed", "Invalid accounting request.", 400, cid)
        : fail("internal_error", "Accounting operation failed.", 500, cid);
    }
  };
}
export const accountingOpenApiPaths = {
  "/api/v1/accounting/health": { get: { operationId: "getAccountingHealth" } },
  "/api/v1/accounting/sync-runs": {
    get: { operationId: "listAccountingSyncRuns" },
    post: { operationId: "startAccountingSync" }
  },
  "/api/v1/accounting/reconciliation": { get: { operationId: "listAccountingReconciliation" } },
  "/api/v1/accounting/reconciliation/{provider}/{customerId}": {
    post: { operationId: "resolveAccountingCustomer" }
  },
  "/api/v1/accounting/status": { get: { operationId: "listAccountStatuses" } },
  "/api/v1/accounting/clients/{clientId}": { get: { operationId: "getClientAccounting" } },
  "/api/v1/accounting/clients/{clientId}/exception": {
    put: { operationId: "setAccountException" },
    delete: { operationId: "removeAccountException" }
  }
};
