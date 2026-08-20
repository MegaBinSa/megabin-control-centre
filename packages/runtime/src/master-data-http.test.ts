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
  it("passes the browser service-region scope to the list RPC", async () => {
    const serviceRegionId = "51000000-0000-0000-0000-000000000001";
    const rpc = vi.fn().mockResolvedValue({
      data: { items: [], page: 1, page_size: 25, total: 0 },
      error: null
    });
    const handler = createMasterDataHandler({ actorId, id: () => actorId, rpc: { rpc } });
    const response = await handler(
      new Request(`http://test/api/v1/master-data/clients?serviceRegionId=${serviceRegionId}`)
    );

    expect(response?.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "master_data_list",
      expect.objectContaining({
        p_resource: "clients",
        p_query: expect.objectContaining({ service_region_id: serviceRegionId })
      })
    );
  });
  it("accepts a lifecycle-only client patch with offset concurrency metadata", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        client_id: actorId,
        organisation_name: null,
        lifecycle_status: "active",
        updated_at: "2026-08-20T06:16:00+00:00"
      },
      error: null
    });
    const handler = createMasterDataHandler({ actorId, id: () => actorId, rpc: { rpc } });
    const response = await handler(
      new Request(`http://test/api/v1/master-data/clients/${actorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "activate-client" },
        body: JSON.stringify({
          lifecycleStatus: "active",
          expectedUpdatedAt: "2026-08-20T06:15:12.123456+00:00"
        })
      })
    );

    expect(response?.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "master_data_update",
      expect.objectContaining({
        p_resource: "clients",
        p_body: {
          lifecycle_status: "active",
          expected_updated_at: "2026-08-20T06:15:12.123456+00:00"
        }
      })
    );
    expect(await response?.json()).toMatchObject({
      ok: true,
      data: { organisationName: null, lifecycleStatus: "active" }
    });
  });
  it("publishes operations for every Phase 1B resource", () => {
    expect(Object.keys(masterDataOpenApiPaths())).toHaveLength(33);
  });
});
