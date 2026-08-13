import type { ApiErrorCode } from "@megabin/api-client";
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
}

export const canonicalMigrationFields = [
  "legacyClientReference",
  "clientName",
  "organisationName",
  "contactName",
  "mobile",
  "email",
  "addressLine1",
  "suburb",
  "city",
  "postalCode",
  "latitude",
  "longitude",
  "drumCount",
  "billingReference",
  "serviceStartDate",
  "collectionDay",
  "team",
  "legacyStatus",
  "agreementReference"
] as const;
const required = new Set([
  "legacyClientReference",
  "clientName",
  "contactName",
  "addressLine1",
  "suburb",
  "city",
  "drumCount",
  "collectionDay",
  "legacyStatus"
]);
export const canonicalMappingV1 = canonicalMigrationFields.map((canonicalField) => ({
  sourceColumn: canonicalField,
  canonicalField,
  required: required.has(canonicalField),
  transformation: [
    "mobile",
    "email",
    "clientName",
    "contactName",
    "addressLine1",
    "suburb",
    "city"
  ].includes(canonicalField)
    ? "normalize"
    : "identity"
}));

function csvRecords(csv: string): string[][] {
  if (new TextEncoder().encode(csv).byteLength > 5_000_000) throw new Error("file_too_large");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("invalid_csv");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
async function sha(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export async function parseCanonicalCsv(csv: string) {
  const records = csvRecords(csv);
  if (records.length < 2) throw new Error("empty_import");
  if (records.length > 5001) throw new Error("row_limit_exceeded");
  const headers = (records[0] ?? []).map((v) => v.trim());
  const missing = [...required].filter((v) => !headers.includes(v));
  if (missing.length) throw new Error(`missing_columns:${missing.join(",")}`);
  const rows = [];
  for (let i = 1; i < records.length; i++) {
    const payload = Object.fromEntries(headers.map((h, x) => [h, (records[i]?.[x] ?? "").trim()]));
    if (Object.values(payload).some((v) => /^[=+@]/.test(v) || /^-[A-Za-z(]/.test(v)))
      throw new Error(`unsafe_formula_row:${i + 1}`);
    for (const n of ["latitude", "longitude", "drumCount", "collectionDay"]) {
      if (payload[n] !== "") payload[n] = Number(payload[n]) as never;
    }
    rows.push({
      rowNumber: i + 1,
      rowKey: String(payload.legacyClientReference || i),
      externalClientReference: String(payload.legacyClientReference || ""),
      payload,
      fingerprint: await sha(payload)
    });
  }
  return { rows, fileHash: await sha(csv), mappingVersion: "canonical-v1" };
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
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [
            k.replace(/_([a-z])/g, (_m, l: string) => l.toUpperCase()),
            camel(v)
          ])
        )
      : value;

export function createClientMigrationHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (!path.startsWith("/client-migrations")) return null;
    const cid = request.headers.get("X-Correlation-Id") ?? deps.id();
    if (!deps.actorId)
      return fail("authentication_required", "Authentication is required.", 401, cid);
    const run = async (name: string, p: Record<string, unknown>) => {
      const r = await deps.rpc.rpc(name, p);
      if (!r.error) return json({ ok: true, data: camel(r.data) });
      if (r.error.code === "42501")
        return fail("permission_denied", "Permission denied.", 403, cid);
      if (r.error.code === "40001")
        return fail("conflict", "The migration changed concurrently.", 409, cid);
      if (r.error.code === "P0002")
        return fail("not_found", "Migration resource not found.", 404, cid);
      if (["22023", "55000"].includes(r.error.code ?? ""))
        return fail(
          "validation_failed",
          r.error.message.split("\n")[0] ?? "Invalid migration operation.",
          400,
          cid
        );
      return fail("internal_error", "Migration operation failed.", 500, cid);
    };
    try {
      if (path === "/client-migrations" && request.method === "GET")
        return run("client_migration_list", {
          p_actor_id: deps.actorId,
          p_query: Object.fromEntries(url.searchParams)
        });
      if (path === "/client-migrations" && request.method === "POST") {
        const body = z
          .object({
            sourceType: z.enum(["canonical_csv", "canonical_json", "megabin_spreadsheet"]),
            sourceName: z.string().min(1).max(200),
            sourceReference: z.string().max(500).optional(),
            sourceFileHash: z.string().regex(/^[a-f0-9]{64}$/),
            mappingVersion: z.string().min(1).max(100),
            notes: z.string().max(1000).optional()
          })
          .strict()
          .parse(await request.json());
        return run("client_migration_create_batch", {
          p_actor_id: deps.actorId,
          p_body: { ...body, environment: deps.environment },
          p_correlation_id: cid
        });
      }
      const detail = /^\/client-migrations\/([0-9a-f-]+)$/.exec(path);
      if (detail && request.method === "GET")
        return run("client_migration_detail", { p_actor_id: deps.actorId, p_batch_id: detail[1] });
      const rows = /^\/client-migrations\/([0-9a-f-]+)\/rows$/.exec(path);
      if (rows && request.method === "GET")
        return run("client_migration_rows", {
          p_actor_id: deps.actorId,
          p_batch_id: rows[1],
          p_query: Object.fromEntries(url.searchParams)
        });
      const report = /^\/client-migrations\/([0-9a-f-]+)\/report$/.exec(path);
      if (report && request.method === "GET")
        return run("client_migration_report", {
          p_actor_id: deps.actorId,
          p_batch_id: report[1]
        });
      const rowDetail = /^\/client-migrations\/rows\/([0-9a-f-]+)$/.exec(path);
      if (rowDetail && request.method === "GET")
        return run("client_migration_row_detail", {
          p_actor_id: deps.actorId,
          p_row_id: rowDetail[1]
        });
      const action =
        /^\/client-migrations\/([0-9a-f-]+)\/(import|process|dry-run|bulk-review-safe|approve|activate)$/.exec(
          path
        );
      if (action && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        let rows = body.rows;
        if (action[2] === "import" && typeof body.csv === "string")
          rows = (await parseCanonicalCsv(body.csv)).rows;
        if (action[2] === "bulk-review-safe")
          return run("client_migration_bulk_review_safe", {
            p_actor_id: deps.actorId,
            p_batch_id: action[1],
            p_mode: body.mode,
            p_reason: body.reason ?? null,
            p_correlation_id: cid
          });
        return run(
          `client_migration_${action[2] === "dry-run" ? "dry_run" : action[2] === "import" ? "import_rows" : action[2]}`,
          {
            p_actor_id: deps.actorId,
            p_batch_id: action[1],
            p_expected_version: body.expectedVersion,
            p_rows: rows,
            p_correlation_id: cid
          }
        );
      }
      const row = /^\/client-migrations\/rows\/([0-9a-f-]+)\/(review|retry)$/.exec(path);
      if (row && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        return row[2] === "retry"
          ? run("client_migration_retry_row", {
              p_actor_id: deps.actorId,
              p_row_id: row[1],
              p_expected_attempt: body.expectedAttempt,
              p_correlation_id: cid
            })
          : run("client_migration_review_row", {
              p_actor_id: deps.actorId,
              p_row_id: row[1],
              p_expected_version: body.expectedVersion,
              p_decision: body.decision,
              p_plan: body.plan,
              p_reason: body.reason ?? null,
              p_correlation_id: cid
            });
      }
      return fail("not_found", "Endpoint not found.", 404, cid);
    } catch (e) {
      return e instanceof ZodError ||
        (e instanceof Error &&
          ["file_too_large", "invalid_csv", "empty_import", "row_limit_exceeded"].some((x) =>
            e.message.startsWith(x)
          ))
        ? fail("validation_failed", e instanceof Error ? e.message : "Invalid request.", 400, cid)
        : fail("internal_error", "Migration operation failed.", 500, cid);
    }
  };
}

export const clientMigrationOpenApiPaths = {
  "/api/v1/client-migrations": {
    get: { operationId: "listClientMigrations" },
    post: { operationId: "createClientMigration" }
  },
  "/api/v1/client-migrations/{batchId}": { get: { operationId: "getClientMigration" } },
  "/api/v1/client-migrations/{batchId}/rows": {
    get: { operationId: "listClientMigrationRows" }
  },
  "/api/v1/client-migrations/{batchId}/report": {
    get: { operationId: "getClientMigrationReport" }
  },
  "/api/v1/client-migrations/rows/{rowId}": {
    get: { operationId: "getClientMigrationRow" }
  },
  "/api/v1/client-migrations/{batchId}/import": {
    post: { operationId: "importClientMigrationRows" }
  },
  "/api/v1/client-migrations/{batchId}/process": {
    post: { operationId: "processClientMigration" }
  },
  "/api/v1/client-migrations/{batchId}/dry-run": { post: { operationId: "dryRunClientMigration" } },
  "/api/v1/client-migrations/{batchId}/bulk-review-safe": {
    post: { operationId: "bulkReviewSafeClientMigrationRows" }
  },
  "/api/v1/client-migrations/{batchId}/approve": {
    post: { operationId: "approveClientMigration" }
  },
  "/api/v1/client-migrations/{batchId}/activate": {
    post: { operationId: "activateClientMigration" }
  },
  "/api/v1/client-migrations/rows/{rowId}/review": {
    post: { operationId: "reviewClientMigrationRow" }
  },
  "/api/v1/client-migrations/rows/{rowId}/retry": {
    post: { operationId: "retryClientMigrationRow" }
  }
};
