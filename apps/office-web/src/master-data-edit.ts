const readOnlyKeys = new Set(["createdAt", "updatedAt", "archivedAt", "location", "boundary"]);

const entityIdKeys = {
  clients: "clientId",
  "client-contacts": "clientContactId",
  "service-addresses": "serviceAddressId",
  "client-services": "clientServiceId",
  "service-configurations": "serviceConfigurationId",
  "service-regions": "serviceRegionId",
  depots: "depotId",
  territories: "territoryId",
  teams: "teamId",
  staff: "staffId",
  vehicles: "vehicleId"
} as const;

export type EditableMasterDataResource = keyof typeof entityIdKeys;

export function masterDataEntityId(
  resource: EditableMasterDataResource,
  record: Readonly<Record<string, unknown>>
): string {
  const key = entityIdKeys[resource];
  const value = record[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`The ${resource} record is missing its ${key}.`);
  return value;
}

export function editableMasterDataRecord(
  record: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.endsWith("Id") && !readOnlyKeys.has(key))
  );
}

export function buildMasterDataUpdate(
  original: Readonly<Record<string, unknown>>,
  edited: Readonly<Record<string, unknown>>,
  expectedUpdatedAt: unknown
): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.entries(edited).filter(
        ([key, value]) => JSON.stringify(original[key]) !== JSON.stringify(value)
      )
    ),
    expectedUpdatedAt: String(expectedUpdatedAt)
  };
}
