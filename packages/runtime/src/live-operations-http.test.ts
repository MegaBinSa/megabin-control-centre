import { describe, expect, it, vi } from "vitest";
import { createLiveOperationsHandler } from "./live-operations-http.js";
const actor = "61000000-0000-4000-8000-000000000001";
describe("live operations HTTP", () => {
  it("requires authentication", async () => {
    const handler = createLiveOperationsHandler({
      actorId: null,
      id: () => "c",
      rpc: { rpc: vi.fn() }
    });
    expect((await handler(new Request("https://test/api/v1/live-operations")))?.status).toBe(401);
  });
  it("routes fixed regional overview", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { routes: [] }, error: null });
    const handler = createLiveOperationsHandler({ actorId: actor, id: () => "c", rpc: { rpc } });
    expect(
      (await handler(new Request("https://test/api/v1/live-operations?serviceRegionId=r")))?.status
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith("live_operations_overview", {
      p_actor_id: actor,
      p_region_id: "r"
    });
  });
  it("denies arbitrary routes", async () => {
    const handler = createLiveOperationsHandler({
      actorId: actor,
      id: () => "c",
      rpc: { rpc: vi.fn() }
    });
    expect(
      (await handler(new Request("https://test/api/v1/live-operations/raw-sql")))?.status
    ).toBe(404);
  });
});
