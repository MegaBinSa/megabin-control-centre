import type { CommandContext, Uuid } from "@megabin/domain-types";
import type { AnyMasterRecord, MasterDataFilter, MasterDataEntityKind } from "./types.js";

export interface MasterDataRepository {
  create(record: AnyMasterRecord, context: CommandContext): Promise<AnyMasterRecord>;
  update(
    id: Uuid,
    kind: MasterDataEntityKind,
    patch: Readonly<Record<string, unknown>>,
    context: CommandContext
  ): Promise<AnyMasterRecord>;
  archive(id: Uuid, kind: MasterDataEntityKind, context: CommandContext): Promise<AnyMasterRecord>;
  get(id: Uuid, kind: MasterDataEntityKind): Promise<AnyMasterRecord | null>;
  list(filter: MasterDataFilter): Promise<readonly AnyMasterRecord[]>;
}

export interface PermissionGuard {
  require(
    permission: "master_data.read" | "master_data.write",
    context: CommandContext,
    serviceRegionId?: Uuid
  ): Promise<void>;
}

export class MasterDataApplicationService {
  public constructor(
    private readonly repository: MasterDataRepository,
    private readonly permissions: PermissionGuard
  ) {}

  public async create(record: AnyMasterRecord, context: CommandContext): Promise<AnyMasterRecord> {
    await this.permissions.require(
      "master_data.write",
      context,
      "serviceRegionId" in record ? record.serviceRegionId : undefined
    );
    return this.repository.create(record, context);
  }

  public async update(
    id: Uuid,
    kind: MasterDataEntityKind,
    patch: Readonly<Record<string, unknown>>,
    context: CommandContext
  ): Promise<AnyMasterRecord> {
    await this.permissions.require("master_data.write", context);
    return this.repository.update(id, kind, patch, context);
  }

  public async archive(
    id: Uuid,
    kind: MasterDataEntityKind,
    context: CommandContext
  ): Promise<AnyMasterRecord> {
    await this.permissions.require("master_data.write", context);
    return this.repository.archive(id, kind, context);
  }

  public async get(
    id: Uuid,
    kind: MasterDataEntityKind,
    context: CommandContext
  ): Promise<AnyMasterRecord | null> {
    await this.permissions.require("master_data.read", context);
    return this.repository.get(id, kind);
  }

  public async list(
    filter: MasterDataFilter,
    context: CommandContext
  ): Promise<readonly AnyMasterRecord[]> {
    await this.permissions.require("master_data.read", context, filter.serviceRegionId);
    return this.repository.list(filter);
  }
}
