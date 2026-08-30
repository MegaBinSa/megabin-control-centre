import { describe, expect, it, vi } from "vitest";
import { createClientSkipHandler } from "./client-skip-http.js";
const setup = (actorId: string | null = "actor-1") => {
  const rpc = { rpc: vi.fn(async () => ({ data: { items: [] }, error: null })) };
  return { rpc, handler: createClientSkipHandler({ rpc, actorId, id: () => "correlation-1" }) };
};
describe("client SKIP HTTP boundary", () => {
  it("serves the scoped queue and detail through fixed RPCs", async () => {
    const d = setup();
    expect((await d.handler(new Request("http://x/api/v1/client-skips")))?.status).toBe(200);
    expect(
      (
        await d.handler(
          new Request("http://x/api/v1/client-skips/93000000-0000-4000-8000-000000000001")
        )
      )?.status
    ).toBe(200);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "client_skip_list",
      expect.objectContaining({ p_actor: "actor-1" })
    );
  });
  it("serves the queue when the hosted Edge Function slug prefixes the API path", async () => {
    const d = setup();
    const response = await d.handler(
      new Request("https://project.supabase.co/functions/v1/platform-runtime/api/v1/client-skips")
    );
    expect(response?.status).toBe(200);
    expect(d.rpc.rpc).toHaveBeenCalledWith("client_skip_list", {
      p_actor: "actor-1",
      p_query: {}
    });
  });
  it("passes optimistic approval and rejection commands", async () => {
    const d = setup();
    for (const action of ["approve", "reject"])
      await d.handler(
        new Request(`http://x/api/v1/client-skips/93000000-0000-4000-8000-000000000001/${action}`, {
          method: "POST",
          body: JSON.stringify({ expectedVersion: 2, reason: "Office decision" })
        })
      );
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "client_skip_approve",
      expect.objectContaining({ p_expected_version: 2, p_reason: "Office decision" })
    );
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "client_skip_reject",
      expect.objectContaining({ p_action: "rejected" })
    );
  });
  it("requests controlled replan without publishing", async () => {
    const d = setup();
    const response = await d.handler(
      new Request("http://x/api/v1/client-skips/93000000-0000-4000-8000-000000000001/replan", {
        method: "POST",
        body: JSON.stringify({ reason: "Approved SKIP" })
      })
    );
    expect(response?.status).toBe(202);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "client_skip_replan",
      expect.objectContaining({ p_reason: "Approved SKIP" })
    );
  });
  it("denies unauthenticated access", async () => {
    expect((await setup(null).handler(new Request("http://x/api/v1/client-skips")))?.status).toBe(
      401
    );
  });
});
