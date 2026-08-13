import { describe, expect, it, vi } from "vitest";
import { createClientMigrationHandler, parseCanonicalCsv } from "./client-migration-http.js";
const header =
  "legacyClientReference,clientName,contactName,mobile,email,addressLine1,suburb,city,drumCount,serviceStartDate,collectionDay,team,legacyStatus\n";
describe("client migration boundary", () => {
  it("parses a synthetic canonical spreadsheet without executing formulas", async () => {
    const r = await parseCanonicalCsv(
      header +
        "LEG-1,Synthetic Client,Test Contact,0821234567,test@example.invalid,1 Test Road,Test Suburb,Pretoria,2,2026-01-01,1,TEAM-A,active"
    );
    expect(r.rows).toHaveLength(1);
    expect(r.mappingVersion).toBe("canonical-v1");
    await expect(
      parseCanonicalCsv(
        header +
          "LEG-2,=CMD(),Test,0821234567,test@example.invalid,1 Test Road,Test,Pretoria,1,2026-01-01,1,T,active"
      )
    ).rejects.toThrow("unsafe_formula");
  });
  it("rejects anonymous access", async () => {
    const h = createClientMigrationHandler({
      rpc: { rpc: vi.fn() },
      actorId: null,
      id: () => "c",
      environment: "local"
    });
    expect((await h(new Request("http://x/api/v1/client-migrations")))?.status).toBe(401);
  });
  it("maps batch creation and CSV import to fixed RPCs", async () => {
    const rpc = {
      rpc: vi.fn().mockResolvedValue({ data: { client_migration_batch_id: "b" }, error: null })
    };
    const h = createClientMigrationHandler({
      rpc,
      actorId: "a",
      id: () => "c",
      environment: "local"
    });
    await h(
      new Request("http://x/api/v1/client-migrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: "canonical_csv",
          sourceName: "synthetic.csv",
          sourceFileHash: "a".repeat(64),
          mappingVersion: "canonical-v1"
        })
      })
    );
    expect(rpc.rpc).toHaveBeenCalledWith(
      "client_migration_create_batch",
      expect.objectContaining({ p_actor_id: "a" })
    );
  });
  it("returns concurrency conflicts safely", async () => {
    const h = createClientMigrationHandler({
      rpc: {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "stale" } })
      },
      actorId: "a",
      id: () => "c",
      environment: "local"
    });
    expect(
      (
        await h(
          new Request(
            "http://x/api/v1/client-migrations/00000000-0000-4000-8000-000000000001/dry-run",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: '{"expectedVersion":2}'
            }
          )
        )
      )?.status
    ).toBe(409);
  });
});
