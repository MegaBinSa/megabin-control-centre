import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readAccountingUatConfig,
  submitAccountingUatSync,
  validateAccountingUatPlan
} from "../scripts/accounting-uat-sync.mjs";
const sourceSha = "6e8c08131057b016235f08fa875b70ad8b2ca487",
  projectRef = "xniweqdmswzljcgkfglx",
  syncIdentity = "uat:accounting:UAT-FIN-001:fake-sync:01";
const base = {
  environment: "staging",
  projectRef,
  supabaseUrl: `https://${projectRef}.supabase.co`,
  runtimeUrl: `https://${projectRef}.supabase.co/functions/v1/platform-runtime`,
  publishableKey: "synthetic-key",
  provider: "zoho-books-fake",
  operatorEmail: "staging-accounting@megabin.local",
  operatorPassword: "protected-password",
  sourceSha,
  mode: "initial_sync",
  confirmation: `SYNC-UAT-FIN-001:${projectRef}:${syncIdentity}:${sourceSha}:initial_sync`,
  workflowRunId: "123",
  workflowRunAttempt: "1",
  operator: "tester",
  evidencePath: "synthetic-evidence.json"
};
const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true }))));
function fetcher(duplicate = false) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/auth/v1/token")) return Response.json({ access_token: "protected-token" });
    const h = new Headers(init?.headers);
    expect(h.get("Authorization")).toBe("Bearer protected-token");
    if (url.endsWith("/office/profile"))
      return Response.json({
        ok: true,
        data: {
          displayName: "Synthetic Staging Accounting Operator",
          roles: ["operations_manager"],
          permissions: ["accounting.sync"],
          globalAccess: true
        }
      });
    if (init?.method === "POST") {
      expect(h.get("Idempotency-Key")).toBe(syncIdentity);
      return Response.json(
        {
          ok: true,
          data: {
            syncRunId: "7f000000-0000-4000-8000-000000000001",
            status: duplicate ? "succeeded" : "pending",
            duplicate
          }
        },
        { status: duplicate ? 200 : 202 }
      );
    }
    return Response.json({
      ok: true,
      data: {
        items: [
          {
            syncRunId: "7f000000-0000-4000-8000-000000000001",
            status: "succeeded",
            fetchedCounts: { customers: 3 }
          }
        ]
      }
    });
  });
}
describe("protected Accounting UAT synchronization", () => {
  it("accepts only the exact fake-provider Shared Staging plan", async () => {
    const c = await readAccountingUatConfig();
    expect(validateAccountingUatPlan(c, base)).toMatchObject({ ok: true, errors: [] });
    const unsafe = validateAccountingUatPlan(c, {
      ...base,
      projectRef: "production-project-ref",
      supabaseUrl: "https://production-project-ref.supabase.co",
      provider: "zoho-books",
      operatorEmail: "staging-office@megabin.local"
    });
    expect(unsafe.ok).toBe(false);
    expect(unsafe.errors.join(" ")).toContain("Production references are forbidden");
    expect(unsafe.errors.join(" ")).toContain("fake accounting provider");
  });
  it("runs once, records sanitized evidence, and supports an exact retry", async () => {
    const d = await mkdtemp(join(tmpdir(), "megabin-fin-"));
    dirs.push(d);
    const initial = await submitAccountingUatSync(
      { ...base, evidencePath: join(d, "initial.json") },
      fetcher() as unknown as typeof fetch,
      async () => undefined
    );
    expect(initial).toMatchObject({
      result: "Passed",
      httpStatus: 202,
      duplicate: false,
      lifecycleStatus: "succeeded"
    });
    const text = await readFile(join(d, "initial.json"), "utf8");
    for (const secret of [
      base.operatorPassword,
      base.operatorEmail,
      base.publishableKey,
      "protected-token",
      "INV-SYN-100"
    ])
      expect(text).not.toContain(secret);
    const mode = "idempotency_retry";
    const retry = await submitAccountingUatSync(
      {
        ...base,
        mode,
        confirmation: `SYNC-UAT-FIN-001:${projectRef}:${syncIdentity}:${sourceSha}:${mode}`,
        evidencePath: join(d, "retry.json")
      },
      fetcher(true) as unknown as typeof fetch,
      async () => undefined
    );
    expect(retry).toMatchObject({ result: "Passed", httpStatus: 200, duplicate: true });
  });
  it("keeps the workflow protected and mutation-bounded", () => {
    const w = readFileSync(".github/workflows/submit-staging-accounting-uat.yml", "utf8");
    expect(w).toContain("workflow_dispatch:");
    expect(w).not.toMatch(/\b(push|schedule):/);
    expect(w).toContain("environment: staging");
    expect(w).toContain('test "$(git rev-parse origin/main)" = "$SOURCE_SHA"');
    expect(w).toContain("MEGABIN_ACCOUNTING_PROVIDER: zoho-books-fake");
    expect(w).toContain("${{ secrets.STAGING_ACCOUNTING_PASSWORD }}");
    expect(w.match(/scripts\/accounting-uat-sync\.mjs/g)).toHaveLength(1);
    expect(w).not.toMatch(/supabase (db|migration|functions|link)/);
    expect(w).not.toMatch(/\b(truncate|delete from|drop schema|reset|seed)\b/i);
  });
});
