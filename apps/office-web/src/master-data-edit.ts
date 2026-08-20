const readOnlyKeys = new Set(["createdAt", "updatedAt", "archivedAt", "location", "boundary"]);

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
