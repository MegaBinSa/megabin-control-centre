import type { MasterDataApiClient } from "@megabin/api-client";

export interface OfficeServiceRegion {
  readonly serviceRegionId: string;
  readonly name: string;
}

export async function loadAuthorizedServiceRegions(
  api: MasterDataApiClient,
  serviceRegionIds: readonly string[]
): Promise<readonly OfficeServiceRegion[]> {
  if (serviceRegionIds.length === 0)
    return (await api.list<OfficeServiceRegion>("service-regions")).items;

  const pages = await Promise.all(
    serviceRegionIds.map((serviceRegionId) =>
      api.list<OfficeServiceRegion>(
        "service-regions",
        new URLSearchParams({ serviceRegionId }).toString()
      )
    )
  );
  return pages.flatMap((page) => page.items);
}
