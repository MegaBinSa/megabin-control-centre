import { describe, expect, it, vi } from "vitest";
import { createWebsiteIntakeHandler } from "./website-intake-http.js";

const submission = {
  sourceSubmissionId: "signup-100",
  payloadVersion: "1.0",
  submittedAt: "2026-08-13T05:00:00+02:00",
  client: { type: "individual", displayName: "Synthetic Customer" },
  contact: { name: "Synthetic Customer", mobile: "082 123 4567", email: "TEST@EXAMPLE.COM" },
  address: {
    addressLine1: "1 Test Street",
    suburb: "Test Suburb",
    city: "Pretoria",
    postalCode: "0001",
    latitude: -25.75,
    longitude: 28.2
  },
  requestedDrumCount: 2,
  requestedStartDate: "2026-08-20"
};

function setup(actorId: string | null = null) {
  const rpc = { rpc: vi.fn() };
  const deferred: Promise<unknown>[] = [];
  const handler = createWebsiteIntakeHandler({
    rpc,
    actorId,
    id: () => "00000000-0000-4000-8000-000000000099",
    integrationKey: "megabin-website-onboarding-local",
    integrationSecret: "synthetic-secret",
    defer: (work) => deferred.push(work)
  });
  return { rpc, handler, deferred };
}

describe("website intake HTTP boundary", () => {
  it("enforces integration authentication", async () => {
    const { handler, rpc } = setup();
    const response = await handler(
      new Request("https://local/api/v1/integrations/website/onboarding", {
        method: "POST",
        body: JSON.stringify(submission)
      })
    );
    expect(response?.status).toBe(401);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it("acknowledges a valid submission and defers processing", async () => {
    const { handler, rpc, deferred } = setup();
    rpc.rpc
      .mockResolvedValueOnce({
        data: { submission_id: "00000000-0000-4000-8000-000000000010", duplicate: false },
        error: null
      })
      .mockResolvedValueOnce({ data: { status: "needs_review" }, error: null });
    const response = await handler(
      new Request("https://local/api/v1/integrations/website/onboarding", {
        method: "POST",
        headers: {
          "X-Integration-Key": "megabin-website-onboarding-local",
          "X-Integration-Secret": "synthetic-secret",
          "Idempotency-Key": "signup-100"
        },
        body: JSON.stringify(submission)
      })
    );
    expect(response?.status).toBe(202);
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    expect(rpc.rpc).toHaveBeenLastCalledWith("website_intake_process", expect.any(Object));
  });

  it("returns the prior result for a duplicate retry", async () => {
    const { handler, rpc } = setup();
    rpc.rpc.mockResolvedValue({
      data: { submission_id: "00000000-0000-4000-8000-000000000010", duplicate: true },
      error: null
    });
    const response = await handler(
      new Request("https://local/api/v1/integrations/website/onboarding", {
        method: "POST",
        headers: {
          "X-Integration-Key": "megabin-website-onboarding-local",
          "X-Integration-Secret": "synthetic-secret",
          "Idempotency-Key": "signup-100"
        },
        body: JSON.stringify(submission)
      })
    );
    expect(response?.status).toBe(200);
  });

  it("maps a changed-payload identity conflict to 409", async () => {
    const { handler, rpc } = setup();
    rpc.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "conflict" } });
    const response = await handler(
      new Request("https://local/api/v1/integrations/website/onboarding", {
        method: "POST",
        headers: {
          "X-Integration-Key": "megabin-website-onboarding-local",
          "X-Integration-Secret": "synthetic-secret",
          "Idempotency-Key": "signup-100"
        },
        body: JSON.stringify({ ...submission, requestedDrumCount: 3 })
      })
    );
    expect(response?.status).toBe(409);
  });

  it("maps an unknown configured integration identity to authentication failure", async () => {
    const { handler, rpc } = setup();
    rpc.rpc.mockResolvedValue({
      data: null,
      error: { code: "28000", message: "integration_authentication_failed" }
    });
    const response = await handler(
      new Request("https://local/api/v1/integrations/website/onboarding", {
        method: "POST",
        headers: {
          "X-Integration-Key": "megabin-website-onboarding-local",
          "X-Integration-Secret": "synthetic-secret",
          "Idempotency-Key": "signup-100"
        },
        body: JSON.stringify(submission)
      })
    );
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({
      error: { code: "authentication_required" }
    });
  });

  it("enforces Office authentication and stale-review conflicts", async () => {
    const anonymous = setup();
    expect(
      (await anonymous.handler(new Request("https://local/api/v1/website-intake")))?.status
    ).toBe(401);
    const office = setup("00000000-0000-4000-8000-000000000001");
    office.rpc.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "stale" } });
    const response = await office.handler(
      new Request(
        "https://local/api/v1/website-intake/00000000-0000-4000-8000-000000000010/approve",
        {
          method: "POST",
          headers: { "Idempotency-Key": "approve-1" },
          body: JSON.stringify({ expectedVersion: 1, decision: { approvedDrumCount: 2 } })
        }
      )
    );
    expect(response?.status).toBe(409);
  });
});
