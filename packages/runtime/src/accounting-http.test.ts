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
  for (const prefix of ["/api/v1", "/functions/v1/platform-runtime/api/v1"]) {
    it(`accepts existing PostgreSQL client identifiers for reconciliation at ${prefix}`, async () => {
      for (const clientId of [
        "57000000-0000-0000-0000-000000000001",
        "57000000-0000-0000-0000-000000000002",
        "0c1eb73f-c8f8-42d2-8a8a-faabab7bead7"
      ]) {
        const d = deps();
        const response = await d.handler(
          new Request(`http://x${prefix}/accounting/reconciliation/zoho-books-fake/ZC-100`, {
            method: "POST",
            body: JSON.stringify({
              action: "link",
              clientId,
              reason: "Approved synthetic reconciliation"
            })
          })
        );
        expect(response?.status).toBe(200);
        expect(d.rpc.rpc).toHaveBeenCalledExactlyOnceWith("accounting_reconcile", {
          p_actor: "76000000-0000-4000-8000-000000000001",
          p_provider: "zoho-books-fake",
          p_customer: "ZC-100",
          p_action: "link",
          p_client: clientId,
          p_reason: "Approved synthetic reconciliation",
          p_correlation: "cid"
        });
      }
    });
  }
  it("rejects malformed reconciliation identifiers and unexpected fields before RPC", async () => {
    for (const body of [
      { action: "link", clientId: "not-a-uuid", reason: "Approved review" },
      {
        action: "link",
        clientId: "57000000-0000-0000-0000-00000000000g",
        reason: "Approved review"
      },
      {
        action: "link",
        clientId: "57000000-0000-0000-0000-000000000001",
        reason: "Approved review",
        serviceRegionId: "forged"
      }
    ]) {
      const d = deps();
      expect(
        (
          await d.handler(
            new Request("http://x/api/v1/accounting/reconciliation/zoho-books-fake/ZC-100", {
              method: "POST",
              body: JSON.stringify(body)
            })
          )
        )?.status
      ).toBe(400);
      expect(d.rpc.rpc).not.toHaveBeenCalled();
    }
  });
  it("preserves reconciliation permission denial for existing client identifiers", async () => {
    const d = deps();
    d.rpc.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "permission_denied" }
    } as never);
    const response = await d.handler(
      new Request("http://x/api/v1/accounting/reconciliation/zoho-books-fake/ZC-100", {
        method: "POST",
        body: JSON.stringify({
          action: "link",
          clientId: "57000000-0000-0000-0000-000000000001",
          reason: "Approved review"
        })
      })
    );
    expect(response?.status).toBe(403);
  });
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
        headers: { "Content-Type": "application/json", "Idempotency-Key": "sync-test-1" },
        body: JSON.stringify({ syncMode: "initial_full" })
      })
    );
    expect(response?.status).toBe(202);
    await Promise.all(d.deferred);
    expect(d.rpc.rpc).toHaveBeenCalledWith("accounting_ingest_sync", expect.anything());
  });
  it("resolves an exact synchronization retry without repeating provider work", async () => {
    const provider = new FakeZohoBooksAdapter();
    const customers = vi.spyOn(provider, "customers");
    const d = deps(provider);
    d.rpc.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "accounting_start_sync"
          ? {
              sync_run_id: "71000000-0000-4000-8000-000000000001",
              status: "succeeded",
              duplicate: d.rpc.rpc.mock.calls.filter(([called]) => called === name).length > 1
            }
          : { items: [] },
      error: null
    }));
    const request = () =>
      new Request("http://x/api/v1/accounting/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "uat-fin-sync-1" },
        body: JSON.stringify({ syncMode: "initial_full" })
      });
    expect((await d.handler(request()))?.status).toBe(202);
    await Promise.all(d.deferred);
    expect((await d.handler(request()))?.status).toBe(200);
    expect(customers).toHaveBeenCalledTimes(1);
  });
  it("fails closed when an idempotency identity is reused for another request", async () => {
    const d = deps();
    d.rpc.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "accounting_sync_idempotency_conflict" }
    } as never);
    const response = await d.handler(
      new Request("http://x/api/v1/accounting/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "reused" },
        body: JSON.stringify({ syncMode: "incremental" })
      })
    );
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "idempotency_key_reused" }
    });
    expect(d.deferred).toHaveLength(0);
  });
  it("passes capped retry-after and authentication failures to durable failure capture", async () => {
    const d = deps(new FakeZohoBooksAdapter({ failure: "rate_limited", retryAfterMs: 9000 }));
    await d.handler(
      new Request("http://x/api/v1/accounting/sync-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "sync-test-1" },
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
