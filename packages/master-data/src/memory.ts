import type { CommandContext, Uuid } from "@megabin/domain-types";
import type { MasterDataRepository } from "./service.js";
import type { AnyMasterRecord, MasterDataEntityKind, MasterDataFilter } from "./types.js";

export class MemoryMasterDataRepository implements MasterDataRepository {
  private readonly records = new Map<string, AnyMasterRecord>();
  private readonly completedCommands = new Map<Uuid, AnyMasterRecord>();
  public readonly audit: {
    readonly commandId: Uuid;
    readonly action: string;
    readonly targetId: Uuid;
  }[] = [];

  public async create(record: AnyMasterRecord, context: CommandContext): Promise<AnyMasterRecord> {
    const duplicate = this.completedCommands.get(context.commandId);
    if (duplicate) return duplicate;
    const key = this.key(record.kind, record.id);
    if (this.records.has(key)) throw new Error("conflict");
    this.records.set(key, record);
    this.completedCommands.set(context.commandId, record);
    this.audit.push({
      commandId: context.commandId,
      action: `${record.kind}.created`,
      targetId: record.id
    });
    return record;
  }

  public async update(
    id: Uuid,
    kind: MasterDataEntityKind,
    patch: Readonly<Record<string, unknown>>,
    context: CommandContext
  ): Promise<AnyMasterRecord> {
    const current = this.records.get(this.key(kind, id));
    if (!current) throw new Error("not_found");
    const updated = {
      ...current,
      ...patch,
      id,
      kind,
      updatedAt: context.receivedAt
    } as AnyMasterRecord;
    this.records.set(this.key(kind, id), updated);
    this.audit.push({ commandId: context.commandId, action: `${kind}.updated`, targetId: id });
    return updated;
  }

  public async archive(
    id: Uuid,
    kind: MasterDataEntityKind,
    context: CommandContext
  ): Promise<AnyMasterRecord> {
    return this.update(
      id,
      kind,
      { archivedAt: context.receivedAt, active: false, lifecycleStatus: "archived" },
      context
    );
  }

  public async get(id: Uuid, kind: MasterDataEntityKind): Promise<AnyMasterRecord | null> {
    return this.records.get(this.key(kind, id)) ?? null;
  }

  public async list(filter: MasterDataFilter): Promise<readonly AnyMasterRecord[]> {
    return [...this.records.values()].filter((record) => {
      if (record.kind !== filter.kind || (!filter.includeArchived && record.archivedAt))
        return false;
      if (
        filter.serviceRegionId &&
        (!("serviceRegionId" in record) || record.serviceRegionId !== filter.serviceRegionId)
      )
        return false;
      return (
        !filter.search || JSON.stringify(record).toLowerCase().includes(filter.search.toLowerCase())
      );
    });
  }

  private key(kind: MasterDataEntityKind, id: Uuid): string {
    return `${kind}:${id}`;
  }
}
