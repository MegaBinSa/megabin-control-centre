import { describe, expect, it } from "vitest";
import { createRosterHandler, type RosterRpcClient } from "./roster-http.js";
const setup = (
  result: { data: unknown; error: { code?: string; message: string } | null },
  actorId: string | null = "actor"
) => {
  const calls: string[] = [];
  const rpc: RosterRpcClient = {
    async rpc(name) {
      calls.push(name);
      return result;
    }
  };
  return {
    calls,
    handle: createRosterHandler({ rpc, actorId, id: () => "b1000000-0000-4000-8000-000000000001" })
  };
};
describe("roster HTTP boundary", () => {
  it("maps fixed generation endpoint and requires idempotency", async () => {
    const c = setup({ data: {}, error: null });
    expect(
      (
        await c.handle(
          new Request("http://local/api/v1/roster/generate", { method: "POST", body: "{}" })
        )
      )?.status
    ).toBe(400);
    await c.handle(
      new Request("http://local/api/v1/roster/generate", {
        method: "POST",
        headers: { "Idempotency-Key": "one" },
        body: JSON.stringify({ serviceRegionId: "r", serviceDate: "2026-08-20" })
      })
    );
    expect(c.calls).toEqual(["roster_generate"]);
  });
  it("requires authentication and maps scope denial", async () => {
    expect(
      (
        await setup({ data: null, error: null }, null).handle(
          new Request("http://local/api/v1/roster/daily")
        )
      )?.status
    ).toBe(401);
    expect(
      (
        await setup({ data: null, error: { code: "42501", message: "denied" } }).handle(
          new Request("http://local/api/v1/roster/daily")
        )
      )?.status
    ).toBe(403);
  });
  it("maps stale and assignment conflicts", async () => {
    const request = new Request(
      "http://local/api/v1/roster/entries/b1000000-0000-4000-8000-000000000002",
      { method: "PUT", headers: { "Idempotency-Key": "one" }, body: "{}" }
    );
    expect(
      (
        await setup({ data: null, error: { code: "40001", message: "stale_update" } }).handle(
          request
        )
      )?.status
    ).toBe(409);
  });
  it("does not expose arbitrary roster commands", async () => {
    expect(
      (
        await setup({ data: null, error: null }).handle(
          new Request("http://local/api/v1/roster/sql")
        )
      )?.status
    ).toBe(404);
  });
});
