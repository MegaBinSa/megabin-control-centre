import { describe, expect, it } from "vitest";
import {
  buildMasterDataUpdate,
  editableMasterDataRecord
} from "../apps/office-web/src/master-data-edit.js";

describe("master-data edit serialization", () => {
  it("creates a lifecycle-only patch from the seeded nullable client shape", () => {
    const seededClient = {
      clientId: "57000000-0000-0000-0000-000000000001",
      clientType: "individual",
      displayName: "Synthetic Client One",
      organisationName: null,
      lifecycleStatus: "pending",
      createdAt: "2026-08-13T10:00:00+00:00",
      updatedAt: "2026-08-20T06:15:12.123456+00:00"
    };
    const original = editableMasterDataRecord(seededClient);

    expect(
      buildMasterDataUpdate(
        original,
        { ...original, lifecycleStatus: "active" },
        seededClient.updatedAt
      )
    ).toEqual({
      lifecycleStatus: "active",
      expectedUpdatedAt: "2026-08-20T06:15:12.123456+00:00"
    });
  });

  it("does not echo unchanged nullable Client Service fields", () => {
    const original = editableMasterDataRecord({
      clientServiceId: "59000000-0000-0000-0000-000000000001",
      clientId: "57000000-0000-0000-0000-000000000001",
      serviceAddressId: "58000000-0000-0000-0000-000000000001",
      lifecycleStatus: "pending",
      serviceStartDate: "2026-08-13",
      serviceEndDate: null,
      cadenceCode: "weekly",
      updatedAt: "2026-08-20T06:15:12+00:00"
    });

    expect(
      buildMasterDataUpdate(
        original,
        { ...original, lifecycleStatus: "active" },
        "2026-08-20T06:15:12+00:00"
      )
    ).toEqual({ lifecycleStatus: "active", expectedUpdatedAt: "2026-08-20T06:15:12+00:00" });
  });
});
