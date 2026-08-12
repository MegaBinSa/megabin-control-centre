import { describe, expect, it } from "vitest";
import { createGeographyHandler, type GeographyRpcClient } from "./geography-http.js";

function handler(
  result: { data: unknown; error: { code?: string; message: string } | null },
  actorId: string | null = "actor"
) {
  const calls: { name: string; parameters?: Readonly<Record<string, unknown>> }[] = [];
  const rpc: GeographyRpcClient = {
    async rpc(name, parameters) {
      calls.push({ name, ...(parameters ? { parameters } : {}) });
      return result;
    }
  };
  return {
    calls,
    handle: createGeographyHandler({
      rpc,
      actorId,
      id: () => "97000000-0000-4000-8000-000000000001"
    })
  };
}

describe("geography HTTP boundary", () => {
  it("maps the fixed point query endpoint to the read-only RPC", async () => {
    const context = handler({ data: { ambiguous: false }, error: null });
    const response = await context.handle(
      new Request("http://local/api/v1/geography/point-query", {
        method: "POST",
        body: JSON.stringify({ latitude: -25.8, longitude: 28.2 })
      })
    );
    expect(response?.status).toBe(200);
    expect(context.calls[0]?.name).toBe("geography_point_query");
  });
  it("requires authentication", async () => {
    const context = handler({ data: null, error: null }, null);
    expect(
      (await context.handle(new Request("http://local/api/v1/geography/map?serviceRegionId=x")))
        ?.status
    ).toBe(401);
  });
  it("returns stable cross-region and stale-write errors", async () => {
    expect(
      (
        await handler({ data: null, error: { code: "42501", message: "denied" } }).handle(
          new Request("http://local/api/v1/geography/map?serviceRegionId=x")
        )
      )?.status
    ).toBe(403);
    expect(
      (
        await handler({ data: null, error: { code: "40001", message: "stale_update" } }).handle(
          new Request("http://local/api/v1/geography/depots/93000000-0000-4000-8000-000000000001", {
            method: "PATCH",
            headers: { "Idempotency-Key": "synthetic-write" },
            body: "{}"
          })
        )
      )?.status
    ).toBe(409);
  });
  it("does not expose arbitrary geography RPC access", async () => {
    expect(
      (
        await handler({ data: null, error: null }).handle(
          new Request("http://local/api/v1/geography/sql", { method: "POST", body: "{}" })
        )
      )?.status
    ).toBe(404);
  });
});
