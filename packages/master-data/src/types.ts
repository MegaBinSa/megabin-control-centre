import type { Uuid } from "@megabin/domain-types";

export type LifecycleStatus = "pending" | "active" | "on_hold" | "cancelled" | "archived";
export type MasterDataEntityKind =
  | "client"
  | "client-contact"
  | "service-address"
  | "client-service"
  | "service-configuration"
  | "service-region"
  | "depot"
  | "territory"
  | "team"
  | "staff"
  | "vehicle";

export interface MasterRecord {
  readonly id: Uuid;
  readonly kind: MasterDataEntityKind;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
}

export interface Client extends MasterRecord {
  readonly kind: "client";
  readonly clientType: "individual" | "organisation";
  readonly displayName: string;
  readonly lifecycleStatus: LifecycleStatus;
}

export interface ServiceAddress extends MasterRecord {
  readonly kind: "service-address";
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly suburb: string;
  readonly city: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface ClientService extends MasterRecord {
  readonly kind: "client-service";
  readonly clientId: Uuid;
  readonly serviceAddressId: Uuid;
  readonly lifecycleStatus: LifecycleStatus;
  readonly cadenceCode: "weekly" | "fortnightly" | "monthly" | "custom";
}

export interface ServiceConfiguration extends MasterRecord {
  readonly kind: "service-configuration";
  readonly clientServiceId: Uuid;
  readonly serviceRegionId: Uuid;
  readonly configuredDrumCount: number;
  readonly operationalDrumUnitCount: number;
  readonly territoryId?: Uuid;
  readonly territoryIsOverride: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
}

export interface GenericMasterRecord extends MasterRecord {
  readonly kind: Exclude<
    MasterDataEntityKind,
    "client" | "service-address" | "client-service" | "service-configuration"
  >;
  readonly serviceRegionId?: Uuid;
  readonly displayName: string;
  readonly active: boolean;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export type AnyMasterRecord =
  | Client
  | ServiceAddress
  | ClientService
  | ServiceConfiguration
  | GenericMasterRecord;

export interface MasterDataFilter {
  readonly kind: MasterDataEntityKind;
  readonly serviceRegionId?: Uuid;
  readonly includeArchived?: boolean;
  readonly search?: string;
}
