import { describe, expect, it, vi } from "vitest";
import {
  fixtureWriteAllowed,
  prepareFinancialFixture,
  validateFinancialFixtureInput
} from "../scripts/financial-uat-fixture.mjs";

describe("approved financial UAT fixture boundary", () => {
  it("requires a release-bound exact pairing confirmation before authentication", async () => {
    const fetcher = vi.fn();
    const evidence = await prepareFinancialFixture(
      { EXPECTED_BUILD_SHA: "a".repeat(40), CONFIRM_FINANCIAL_FIXTURE: "wrong" },
      fetcher
    );
    expect(evidence.outcome).toBe("Failed");
    expect(evidence.failedPhase).toBe("fixed_input");
    expect(fetcher).not.toHaveBeenCalled();
    expect(() =>
      validateFinancialFixtureInput({
        EXPECTED_BUILD_SHA: "a".repeat(40),
        CONFIRM_FINANCIAL_FIXTURE: `PREPARE-UAT-FIN-001:${"a".repeat(40)}:ZC-100-ONE:ZC-200-TWO`
      })
    ).not.toThrow();
  });
  it("allows only the approved mappings, sync and three explicit services", () => {
    expect(fixtureWriteAllowed("/accounting/reconciliation/zoho-books-fake/ZC-100")).toBe(true);
    expect(
      fixtureWriteAllowed(
        "/financial-eligibility/services/59000000-0000-0000-0000-000000000003/reevaluate"
      )
    ).toBe(true);
    for (const path of [
      "/accounting/reconciliation/zoho-books-fake/ZC-300",
      "/accounting/reconciliation/zoho-books/ZC-100",
      "/financial-eligibility/services/59000000-0000-0000-0000-000000000001/hold",
      "/financial-eligibility/services/59000000-0000-0000-0000-000000000001/release",
      "/financial-eligibility/reevaluations",
      "/route-operations",
      "/financial-eligibility/services/b0c742aa-9484-4c49-afd5-c164404c8080/reevaluate"
    ])
      expect(fixtureWriteAllowed(path)).toBe(false);
  });
});
