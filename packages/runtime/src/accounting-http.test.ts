import { describe, expect, it, vi } from "vitest";
import { FakeZohoBooksAdapter } from "@megabin/integrations";
import { createAccountingHandler } from "./accounting-http.js";
const deps = (provider = new FakeZohoBooksAdapter()) => {
  const rpc = {
    rpc: vi.fn(async (name: string) => ({
      data:
        name === "accounting_start_sync"
          ? { sync_run_id: "71000000-0000-4000-8000-000000000001" }
          : { items: [] },
      error: null
    }))
  };
  const deferred: Promise<unknown>[] = [];
  return {
    rpc,
    deferred,
    handler: createAccountingHandler({
      rpc,
      actorId: "76000000-0000-4000-8000-000000000001",
      id: () => "cid",
      environment: "local",
      provider,
      organizationId: "local-synthetic",
      defer: (w) => deferred.push(w)
    })
  };
};
describe("accounting HTTP boundary", () => {
  it("returns controlled health and status reads", async () => {
    const d = deps();
    expect((await d.handler(new Request("http://x/api/v1/accounting/health")))?.status).toBe(200);
    expect((await d.handler(new Request("http://x/api/v1/accounting/status")))?.status).toBe(200);
  });
  it("queues a full sync and completes it asynchronously", async () => {
    const d = deps();
    const response = await d.handler(
      new Request("http://x/api/v1/accounting/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncMode: "initial_full" })
      })
    );
    expect(response?.status).toBe(202);
    await Promise.all(d.deferred);
    expect(d.rpc.rpc).toHaveBeenCalledWith("accounting_ingest_sync", expect.anything());
  });
  it("passes capped retry-after and authentication failures to durable failure capture", async () => {
    const d = deps(new FakeZohoBooksAdapter({ failure: "rate_limited", retryAfterMs: 9000 }));
    await d.handler(
      new Request("http://x/api/v1/accounting/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncMode: "incremental" })
      })
    );
    await Promise.all(d.deferred);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "accounting_fail_sync",
      expect.objectContaining({ p_classification: "rate_limited", p_retry_after_ms: 5000 })
    );
  });
  it("requires authentication", async () => {
    const d = deps();
    const h = createAccountingHandler({
      rpc: d.rpc,
      actorId: null,
      id: () => "cid",
      environment: "local",
      provider: new FakeZohoBooksAdapter(),
      organizationId: "local",
      defer: () => undefined
    });
    expect((await h(new Request("http://x/api/v1/accounting/health")))?.status).toBe(401);
  });
});
