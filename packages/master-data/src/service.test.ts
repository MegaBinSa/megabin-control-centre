import { describe, expect, it } from "vitest";
import type { CommandContext } from "@megabin/domain-types";
import { MasterDataApplicationService } from "./service.js";
import { MemoryMasterDataRepository } from "./memory.js";
import type { Client } from "./types.js";

const context: CommandContext = {
  commandId: "10000000-0000-0000-0000-000000000001",
  idempotencyKey: "one",
  correlationId: "20000000-0000-0000-0000-000000000001",
  actor: { kind: "user", id: "30000000-0000-0000-0000-000000000001" },
  receivedAt: "2026-08-11T00:00:00.000Z"
};
const client: Client = {
  id: "40000000-0000-0000-0000-000000000001",
  kind: "client",
  clientType: "individual",
  displayName: "Synthetic Client",
  lifecycleStatus: "pending",
  createdAt: context.receivedAt,
  updatedAt: context.receivedAt
};

describe("MasterDataApplicationService", () => {
  it("proves create, retrieve, list, update, archive and command idempotency", async () => {
    const repository = new MemoryMasterDataRepository();
    const service = new MasterDataApplicationService(repository, {
      require: async () => undefined
    });
    expect(await service.create(client, context)).toEqual(client);
    expect(await service.create(client, context)).toEqual(client);
    expect(await service.get(client.id, "client", context)).toEqual(client);
    expect(await service.list({ kind: "client" }, context)).toHaveLength(1);
    const updated = await service.update(
      client.id,
      "client",
      { displayName: "Changed" },
      { ...context, commandId: "10000000-0000-0000-0000-000000000002" }
    );
    expect((updated as Client).displayName).toBe("Changed");
    await service.archive(client.id, "client", {
      ...context,
      commandId: "10000000-0000-0000-0000-000000000003"
    });
    expect(await service.list({ kind: "client" }, context)).toHaveLength(0);
    expect(repository.audit).toHaveLength(3);
  });

  it("enforces permissions before repository access", async () => {
    const service = new MasterDataApplicationService(new MemoryMasterDataRepository(), {
      require: async () => {
        throw new Error("permission_denied");
      }
    });
    await expect(service.list({ kind: "client" }, context)).rejects.toThrow("permission_denied");
  });
});
