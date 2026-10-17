import { describe, expect, it, vi } from "vitest";
import { createFinancialEligibilityHandler } from "./financial-eligibility-http.js";
const setup = (actorId: string | null = "76000000-0000-4000-8000-000000000001") => {
  const deferred: Promise<unknown>[] = [];
  const rpc = {
    rpc: vi.fn(async (name: string) => ({
      data:
        name === "financial_eligibility_batch_start"
          ? { financial_eligibility_job_id: "job-1" }
          : { items: [] },
      error: null
    }))
  };
  return {
    rpc,
    deferred,
    handler: createFinancialEligibilityHandler({
      rpc,
      actorId,
      id: () => "correlation-1",
      defer: (work) => deferred.push(work)
    })
  };
};
describe("financial eligibility HTTP boundary", () => {
  for (const prefix of [
    "/api/v1",
    "/functions/v1/platform-runtime/api/v1",
    "/platform-runtime/api/v1"
  ]) {
    it(`resolves authenticated decisions at ${prefix} without writes`, async () => {
      const d = setup();
      const response = await d.handler(
        new Request(`http://x${prefix}/financial-eligibility/decisions?serviceRegionId=region-1`)
      );
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ ok: true, data: { items: [] } });
      expect(d.rpc.rpc).toHaveBeenCalledExactlyOnceWith("financial_eligibility_list", {
        p_actor: "76000000-0000-4000-8000-000000000001",
        p_query: { serviceRegionId: "region-1" }
      });
      expect(d.deferred).toEqual([]);
    });
    it(`requires authentication at ${prefix}`, async () => {
      const d = setup(null);
      expect(
        (await d.handler(new Request(`http://x${prefix}/financial-eligibility/decisions`)))?.status
      ).toBe(401);
      expect(d.rpc.rpc).not.toHaveBeenCalled();
    });
    it(`preserves authorization denial at ${prefix}`, async () => {
      const rpc = {
        rpc: vi.fn(async () => ({ data: null, error: { code: "42501", message: "denied" } }))
      };
      const handler = createFinancialEligibilityHandler({
        rpc,
        actorId: "actor",
        id: () => "unused"
      });
      const response = await handler(
        new Request(`http://x${prefix}/financial-eligibility/decisions`)
      );
      expect(response?.status).toBe(403);
      expect(await response?.json()).toMatchObject({ error: { code: "authorization_denied" } });
    });
  }
  it("serves list, detail and simulation through fixed RPCs", async () => {
    const d = setup();
    expect(
      (await d.handler(new Request("http://x/api/v1/financial-eligibility/decisions")))?.status
    ).toBe(200);
    expect(
      (
        await d.handler(
          new Request(
            "http://x/api/v1/financial-eligibility/services/57000000-0000-0000-0000-000000000001"
          )
        )
      )?.status
    ).toBe(200);
    expect(
      (
        await d.handler(
          new Request(
            "http://x/api/v1/financial-eligibility/services/57000000-0000-0000-0000-000000000001/simulate",
            { method: "POST" }
          )
        )
      )?.status
    ).toBe(200);
  });
  it("passes optimistic versions and reasons to hold and release commands", async () => {
    const d = setup();
    for (const action of ["hold", "release"])
      await d.handler(
        new Request(
          `http://x/api/v1/financial-eligibility/services/57000000-0000-0000-0000-000000000001/${action}`,
          { method: "POST", body: JSON.stringify({ reason: "Office review", expectedVersion: 2 }) }
        )
      );
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "financial_eligibility_hold",
      expect.objectContaining({ p_expected_version: 2, p_reason: "Office review" })
    );
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "financial_eligibility_release",
      expect.objectContaining({ p_expected_version: 2 })
    );
  });
  it("queues bounded batch reevaluation asynchronously and idempotently", async () => {
    const d = setup();
    const response = await d.handler(
      new Request("http://x/api/v1/financial-eligibility/reevaluations", {
        method: "POST",
        headers: { "Idempotency-Key": "reeval-1" },
        body: JSON.stringify({
          scopeType: "region",
          scopeId: "52000000-0000-0000-0000-000000000001"
        })
      })
    );
    expect(response?.status).toBe(202);
    await Promise.all(d.deferred);
    expect(d.rpc.rpc).toHaveBeenCalledWith("financial_eligibility_batch_run", { p_job: "job-1" });
  });
  it("denies unauthenticated financial access", async () => {
    expect(
      (await setup(null).handler(new Request("http://x/api/v1/financial-eligibility/decisions")))
        ?.status
    ).toBe(401);
  });
});
