import { describe, expect, it } from "vitest";
import {
  addressInput,
  clientInput,
  contactInput,
  pagination,
  updateSchemaForResource
} from "./index.js";

describe("master-data validation", () => {
  it("accepts immutable PostgreSQL region UUIDs used by deterministic environments", () => {
    expect(
      pagination.parse({ serviceRegionId: "51000000-0000-0000-0000-000000000001" }).serviceRegionId
    ).toBe("51000000-0000-0000-0000-000000000001");
  });
  it("normalizes common South African mobile formats", () => {
    expect(
      contactInput.parse({
        clientId: "10000000-0000-4000-8000-000000000001",
        contactName: "Test",
        mobile: "082 123 4567"
      }).mobileE164
    ).toBe("+27821234567");
  });
  it("rejects invalid organization, coordinates and pagination", () => {
    expect(() => clientInput.parse({ clientType: "organisation", displayName: "Test" })).toThrow();
    expect(() =>
      addressInput.parse({ addressLine1: "1 Test", suburb: "Test", city: "Test", latitude: -25 })
    ).toThrow();
    expect(() => pagination.parse({ pageSize: "1000" })).toThrow();
  });
  it("accepts lifecycle-only client and service patches with PostgreSQL offset timestamps", () => {
    expect(
      updateSchemaForResource("clients").parse({
        lifecycleStatus: "active",
        expectedUpdatedAt: "2026-08-20T06:15:12.123456+00:00"
      })
    ).toMatchObject({ lifecycleStatus: "active" });
    expect(
      updateSchemaForResource("client-services").parse({
        lifecycleStatus: "active",
        expectedUpdatedAt: "2026-08-20T08:15:12+02:00"
      })
    ).toMatchObject({ lifecycleStatus: "active" });
  });
  it("preserves explicit nullable update semantics", () => {
    expect(
      updateSchemaForResource("clients").parse({
        organisationName: null,
        expectedUpdatedAt: "2026-08-20T06:15:12Z"
      })
    ).toMatchObject({ organisationName: null });
    expect(
      updateSchemaForResource("client-services").parse({
        serviceStartDate: null,
        serviceEndDate: null,
        expectedUpdatedAt: "2026-08-20T06:15:12Z"
      })
    ).toMatchObject({ serviceStartDate: null, serviceEndDate: null });
  });
});
