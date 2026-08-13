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
