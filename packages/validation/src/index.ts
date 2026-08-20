import { z } from "zod";

export const uuid = z.uuid();
export const isoDate = z.iso.date();
export const email = z.email().max(254);
export const southAfricanPhone = z.string().transform((value, context) => {
  const digits = value.replace(/[^0-9+]/g, "").replace(/^0027/, "+27");
  const normalized = digits.startsWith("0") ? `+27${digits.slice(1)}` : digits;
  if (!/^\+27[6-8][0-9]{8}$/.test(normalized)) {
    context.addIssue({ code: "custom", message: "Enter a valid South African mobile number." });
    return z.NEVER;
  }
  return normalized;
});
export const lifecycleStatus = z.enum(["pending", "active", "on_hold", "cancelled", "archived"]);
const postgresUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.string().trim().max(40).optional(),
  serviceRegionId: postgresUuid.optional(),
  sort: z.enum(["createdAt", "updatedAt", "displayName"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc")
});

export const optimisticConcurrencyTimestamp = z.iso.datetime({ offset: true });
const common = z.object({ expectedUpdatedAt: optimisticConcurrencyTimestamp.optional() });
export const clientInput = common
  .extend({
    clientType: z.enum(["individual", "organisation"]),
    displayName: z.string().trim().min(1).max(200),
    organisationName: z.string().trim().max(200).optional(),
    lifecycleStatus: lifecycleStatus.default("pending")
  })
  .superRefine((value, context) => {
    if (value.clientType === "organisation" && !value.organisationName)
      context.addIssue({
        code: "custom",
        path: ["organisationName"],
        message: "Organisation name is required."
      });
  });
export const contactInput = common
  .extend({
    clientId: uuid,
    contactName: z.string().trim().min(1).max(160),
    mobile: southAfricanPhone.optional(),
    email: email.optional(),
    preferredLanguage: z.enum(["english", "afrikaans"]).default("english"),
    isPrimary: z.boolean().default(false),
    isActive: z.boolean().default(true)
  })
  .refine((value) => value.mobile || value.email, {
    message: "A mobile number or email address is required."
  })
  .transform(({ mobile, ...value }) => ({ ...value, ...(mobile ? { mobileE164: mobile } : {}) }));
export const addressInput = common
  .extend({
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: z.string().trim().max(200).optional(),
    suburb: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().max(20).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    validationStatus: z
      .enum(["unvalidated", "valid", "invalid", "needs_review"])
      .default("unvalidated"),
    geocodingStatus: z
      .enum(["not_geocoded", "pending", "geocoded", "failed"])
      .default("not_geocoded"),
    manualReviewRequired: z.boolean().default(false),
    accessNotes: z.string().max(2000).optional(),
    securityInstructions: z.string().max(2000).optional(),
    dangerousAnimal: z.boolean().default(false),
    stairsElevationNotes: z.string().max(1000).optional()
  })
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: "Latitude and longitude must be supplied together."
  });
export const serviceInput = common.extend({
  clientId: uuid,
  serviceAddressId: uuid,
  lifecycleStatus: lifecycleStatus.default("pending"),
  serviceStartDate: isoDate.optional(),
  serviceEndDate: isoDate.optional(),
  cadenceCode: z.enum(["weekly", "fortnightly", "monthly", "custom"]).default("weekly")
});
export const configurationInput = common.extend({
  clientServiceId: uuid,
  serviceRegionId: uuid,
  territoryId: uuid.optional(),
  territoryIsOverride: z.boolean().default(false),
  depotId: uuid.optional(),
  defaultTeamId: uuid.optional(),
  configuredDrumCount: z.number().int().positive(),
  operationalDrumUnitCount: z.number().int().positive().optional(),
  configuredCollectionDay: z.number().int().min(1).max(7).optional(),
  effectiveFrom: isoDate
});
export const serviceRegionInput = common.extend({
  name: z.string().trim().min(1).max(120),
  regionCode: z.string().regex(/^[A-Z][A-Z0-9_-]{1,19}$/),
  defaultTimezone: z.string().default("Africa/Johannesburg"),
  isActive: z.boolean().default(true)
});
export const depotInput = common
  .extend({
    serviceRegionId: uuid,
    name: z.string().trim().min(1).max(120),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: z.string().max(200).optional(),
    suburb: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().max(20).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    geofenceRadiusMetres: z.number().int().min(10).max(5000).default(100),
    isActive: z.boolean().default(true)
  })
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: "Latitude and longitude must be supplied together."
  });
export const territoryInput = common.extend({
  serviceRegionId: uuid,
  name: z.string().trim().min(1).max(120),
  priority: z.number().int().min(-10000).max(10000).default(0),
  defaultDepotId: uuid.optional(),
  preferredCollectionDays: z.array(z.number().int().min(1).max(7)).default([]),
  serviceStatus: z.enum(["active", "inactive", "limited"]).default("active"),
  isActive: z.boolean().default(true)
});
export const teamInput = common.extend({
  serviceRegionId: uuid,
  defaultDepotId: uuid.optional(),
  teamCode: z.string().regex(/^[A-Z][A-Z0-9_-]{1,19}$/),
  name: z.string().trim().min(1).max(120),
  normalVehicleId: uuid.optional(),
  workingHours: z.record(z.string(), z.unknown()).default({}),
  routeEligibility: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true)
});
export const staffInput = common
  .extend({
    userId: uuid.optional(),
    displayName: z.string().trim().min(1).max(160),
    mobile: southAfricanPhone.optional(),
    operationalRole: z.enum(["driver", "assistant", "supervisor", "other"]),
    defaultTeamId: uuid.optional(),
    isActive: z.boolean().default(true)
  })
  .transform(({ mobile, ...value }) => ({ ...value, ...(mobile ? { mobileE164: mobile } : {}) }));
export const vehicleInput = common.extend({
  serviceRegionId: uuid,
  defaultDepotId: uuid.optional(),
  defaultTeamId: uuid.optional(),
  registrationReference: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(120),
  operationalAvailability: z
    .enum(["available", "in_service", "maintenance", "unavailable", "retired"])
    .default("available"),
  estimatedDrumCapacity: z.number().int().positive().optional(),
  afterHoursGraceMinutes: z.number().int().min(0).max(720).default(0),
  currentOdometerKm: z.number().nonnegative().optional(),
  workingHours: z.record(z.string(), z.unknown()).default({}),
  maintenanceConfiguration: z.record(z.string(), z.unknown()).default({}),
  complianceMetadata: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true)
});

const updateCommon = { expectedUpdatedAt: optimisticConcurrencyTimestamp };
const nullable = <T extends z.ZodType>(schema: T) => schema.optional().nullable();

export const clientUpdateInput = z.object({
  ...updateCommon,
  clientType: z.enum(["individual", "organisation"]).optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
  organisationName: nullable(z.string().trim().max(200)),
  lifecycleStatus: lifecycleStatus.optional()
});
export const contactUpdateInput = z.object({
  ...updateCommon,
  clientId: uuid.optional(),
  contactName: z.string().trim().min(1).max(160).optional(),
  mobileE164: nullable(z.string().regex(/^\+27[6-8][0-9]{8}$/)),
  email: nullable(email),
  preferredLanguage: z.enum(["english", "afrikaans"]).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional()
});
export const addressUpdateInput = z
  .object({
    ...updateCommon,
    addressLine1: z.string().trim().min(1).max(200).optional(),
    addressLine2: nullable(z.string().trim().max(200)),
    suburb: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    postalCode: nullable(z.string().trim().max(20)),
    latitude: nullable(z.number().min(-90).max(90)),
    longitude: nullable(z.number().min(-180).max(180)),
    validationStatus: z.enum(["unvalidated", "valid", "invalid", "needs_review"]).optional(),
    geocodingStatus: z.enum(["not_geocoded", "pending", "geocoded", "failed"]).optional(),
    manualReviewRequired: z.boolean().optional(),
    accessNotes: nullable(z.string().max(2000)),
    securityInstructions: nullable(z.string().max(2000)),
    dangerousAnimal: z.boolean().optional(),
    stairsElevationNotes: nullable(z.string().max(1000))
  })
  .refine(
    (value) =>
      (value.latitude === undefined && value.longitude === undefined) ||
      (value.latitude === null && value.longitude === null) ||
      (typeof value.latitude === "number" && typeof value.longitude === "number"),
    { message: "Latitude and longitude must be supplied together." }
  );
export const serviceUpdateInput = z.object({
  ...updateCommon,
  clientId: uuid.optional(),
  serviceAddressId: uuid.optional(),
  lifecycleStatus: lifecycleStatus.optional(),
  serviceStartDate: nullable(isoDate),
  serviceEndDate: nullable(isoDate),
  cadenceCode: z.enum(["weekly", "fortnightly", "monthly", "custom"]).optional()
});

const genericUpdateSchemas = {
  "service-configurations": configurationInput.partial().extend(updateCommon),
  "service-regions": serviceRegionInput.partial().extend(updateCommon),
  depots: depotInput.partial().extend(updateCommon),
  territories: territoryInput.partial().extend(updateCommon),
  teams: teamInput.partial().extend(updateCommon),
  staff: z.object({
    ...updateCommon,
    userId: nullable(uuid),
    displayName: z.string().trim().min(1).max(160).optional(),
    mobileE164: nullable(z.string().regex(/^\+27[6-8][0-9]{8}$/)),
    operationalRole: z.enum(["driver", "assistant", "supervisor", "other"]).optional(),
    defaultTeamId: nullable(uuid),
    isActive: z.boolean().optional()
  }),
  vehicles: vehicleInput.partial().extend(updateCommon)
} satisfies Record<string, z.ZodType>;

export const resourceNames = [
  "clients",
  "client-contacts",
  "service-addresses",
  "client-services",
  "service-configurations",
  "service-regions",
  "depots",
  "territories",
  "teams",
  "staff",
  "vehicles"
] as const;
export type ResourceName = (typeof resourceNames)[number];
export const resourceName = z.enum(resourceNames);

export function schemaForResource(resource: ResourceName): z.ZodType {
  return (
    {
      clients: clientInput,
      "client-contacts": contactInput,
      "service-addresses": addressInput,
      "client-services": serviceInput,
      "service-configurations": configurationInput,
      "service-regions": serviceRegionInput,
      depots: depotInput,
      territories: territoryInput,
      teams: teamInput,
      staff: staffInput,
      vehicles: vehicleInput
    } satisfies Record<ResourceName, z.ZodType>
  )[resource];
}

export function updateSchemaForResource(resource: ResourceName): z.ZodType {
  return (
    {
      clients: clientUpdateInput,
      "client-contacts": contactUpdateInput,
      "service-addresses": addressUpdateInput,
      "client-services": serviceUpdateInput,
      ...genericUpdateSchemas
    } satisfies Record<ResourceName, z.ZodType>
  )[resource];
}
