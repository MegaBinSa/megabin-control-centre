import { describe, expect, it } from "vitest";
import { FakeZohoBooksAdapter, type AccountingProviderAdapter } from "./accounting.js";

describe("provider-neutral accounting adapter", () => {
  it("syncs normalized customers, invoices, payments, and credits", async () => {
    const provider: AccountingProviderAdapter = new FakeZohoBooksAdapter();
    const request = { pageSize: 100 };
    expect((await provider.customers(request)).ok).toBe(true);
    const invoices = await provider.invoices(request);
    expect(invoices.ok && invoices.value.items[0]?.status).toBe("partially_paid");
    expect((await provider.payments(request)).ok).toBe(true);
    const credits = await provider.adjustments(request);
    expect(credits.ok && credits.value.items[0]?.amountMinor).toBe(-10000);
  });

  it("supports incremental changed data without provider types leaking", async () => {
    const first: AccountingProviderAdapter = new FakeZohoBooksAdapter();
    const changed: AccountingProviderAdapter = new FakeZohoBooksAdapter({ revision: 2 });
    const request = { pageSize: 50, modifiedSince: "2026-08-13T00:00:00Z" };
    expect((await first.customers(request)).ok).toBe(true);
    const result = await changed.invoices(request);
    expect(result.ok && result.value.items[0]?.outstandingMinor).toBe(20000);
  });

  it("classifies rate limits with retry-after and authentication health", async () => {
    const limited = new FakeZohoBooksAdapter({ failure: "rate_limited", retryAfterMs: 2500 });
    const result = await limited.customers({ pageSize: 10 });
    expect(!result.ok && result.retryAfterMs).toBe(2500);
    const auth = new FakeZohoBooksAdapter({ failure: "authentication" });
    expect((await auth.health()).status).toBe("authentication_required");
  });
});
