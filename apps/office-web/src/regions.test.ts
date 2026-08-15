import { describe, expect, it, vi } from "vitest";
import type { MasterDataApiClient } from "@megabin/api-client";
import { loadAuthorizedServiceRegions } from "./regions.js";

describe("Office service-region scope", () => {
  it("loads every assigned region through an explicit scoped request", async () => {
    const ids = ["51000000-0000-0000-0000-000000000001", "51000000-0000-0000-0000-000000000002"];
    const list = vi.fn(async (_resource: string, query: string) => {
      const serviceRegionId = new URLSearchParams(query).get("serviceRegionId") ?? "";
      return {
        items: [{ serviceRegionId, name: serviceRegionId }],
        page: 1,
        pageSize: 25,
        total: 1
      };
    });

    const regions = await loadAuthorizedServiceRegions(
      { list } as unknown as MasterDataApiClient,
      ids
    );

    expect(regions.map((region) => region.serviceRegionId)).toEqual(ids);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls.every((call) => call[1].includes("serviceRegionId="))).toBe(true);
  });
});
