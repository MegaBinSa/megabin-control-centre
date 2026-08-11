import { describe, expect, it, vi } from "vitest";
import { createMasterDataHandler, masterDataOpenApiPaths } from "./master-data-http.js";

const actorId = "10000000-0000-4000-8000-000000000001";
describe("master-data HTTP boundary", () => {
  it("denies unauthenticated Office requests", async () => {
    const handler = createMasterDataHandler({
      actorId: null,
      id: () => actorId,
      rpc: { rpc: vi.fn() }
    });
    const response = await handler(new Request("http://test/api/v1/master-data/clients"));
    expect(response?.status).toBe(401);
  });
  it("validates and normalizes contact writes before RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { client_contact_id: actorId }, error: null });
    const handler = createMasterDataHandler({ actorId, id: () => actorId, rpc: { rpc } });
    const response = await handler(
      new Request("http://test/api/v1/master-data/client-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "test" },
        body: JSON.stringify({ clientId: actorId, contactName: "Contact", mobile: "082 123 4567" })
      })
    );
    expect(response?.status).toBe(201);
    expect(rpc.mock.calls[0]?.[1]?.p_body.mobile_e164).toBe("+27821234567");
  });
  it("publishes operations for every Phase 1B resource", () => {
    expect(Object.keys(masterDataOpenApiPaths())).toHaveLength(33);
  });
});
