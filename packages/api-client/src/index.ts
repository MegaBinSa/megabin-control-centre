export const API_VERSION = "v1" as const;
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key" as const;
export const CORRELATION_ID_HEADER = "X-Correlation-Id" as const;

export type ApiErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "validation_failed"
  | "conflict"
  | "idempotency_key_reused"
  | "not_found"
  | "rate_limited"
  | "internal_error";

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly correlationId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError };

export interface IdempotentRequestIdentity {
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export function buildIdempotentRequestHeaders(
  identity: IdempotentRequestIdentity
): Readonly<Record<string, string>> {
  if (identity.idempotencyKey.trim().length === 0) {
    throw new TypeError("An idempotency key is required.");
  }

  if (identity.correlationId.trim().length === 0) {
    throw new TypeError("A correlation ID is required.");
  }

  return {
    [IDEMPOTENCY_KEY_HEADER]: identity.idempotencyKey,
    [CORRELATION_ID_HEADER]: identity.correlationId
  };
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
export interface MasterDataApiOptions {
  readonly baseUrl: string;
  readonly accessToken: () => Promise<string | null>;
  readonly fetch?: typeof globalThis.fetch;
}

export class MasterDataApiClient {
  private readonly fetcher: typeof globalThis.fetch;
  constructor(private readonly options: MasterDataApiOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  list<T>(resource: string, query = ""): Promise<Page<T>> {
    return this.request(`/master-data/${resource}${query ? `?${query}` : ""}`);
  }
  get<T>(resource: string, id: string): Promise<T> {
    return this.request(`/master-data/${resource}/${id}`);
  }
  create<T>(resource: string, body: unknown): Promise<T> {
    return this.request(
      `/master-data/${resource}`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  update<T>(resource: string, id: string, body: unknown): Promise<T> {
    return this.request(
      `/master-data/${resource}/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
      true
    );
  }
  archive<T>(resource: string, id: string, expectedUpdatedAt: string): Promise<T> {
    return this.request(
      `/master-data/${resource}/${id}/archive`,
      { method: "POST", body: JSON.stringify({ expectedUpdatedAt }) },
      true
    );
  }
  profile<T>(): Promise<T> {
    return this.request("/office/profile");
  }
  geographyMap<T>(serviceRegionId: string): Promise<T> {
    return this.request(`/geography/map?${new URLSearchParams({ serviceRegionId })}`);
  }
  geographyPointQuery<T>(body: unknown): Promise<T> {
    return this.request("/geography/point-query", { method: "POST", body: JSON.stringify(body) });
  }
  createTerritoryGeometry<T>(body: unknown): Promise<T> {
    return this.request(
      "/geography/territories",
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  updateTerritoryGeometry<T>(id: string, body: unknown): Promise<T> {
    return this.request(
      `/geography/territories/${id}`,
      { method: "PUT", body: JSON.stringify(body) },
      true
    );
  }
  territoryOverlaps<T>(id: string, body: unknown): Promise<T> {
    return this.request(`/geography/territories/${id}/overlaps`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }
  territoryImpact<T>(id: string, body: unknown): Promise<T> {
    return this.request(`/geography/territories/${id}/impact-preview`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }
  geographyReviews<T>(serviceRegionId: string, status = "open"): Promise<T> {
    return this.request(`/geography/reviews?${new URLSearchParams({ serviceRegionId, status })}`);
  }
  resolveGeographyReview<T>(id: string, body: unknown): Promise<T> {
    return this.request(
      `/geography/reviews/${id}/resolve`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  setTerritoryOverride<T>(clientServiceId: string, body: unknown): Promise<T> {
    return this.request(
      `/geography/services/${clientServiceId}/territory-override`,
      { method: "PUT", body: JSON.stringify(body) },
      true
    );
  }
  updateDepotGeography<T>(depotId: string, body: unknown): Promise<T> {
    return this.request(
      `/geography/depots/${depotId}`,
      { method: "PATCH", body: JSON.stringify(body) },
      true
    );
  }
  serviceAddressGeography<T>(serviceAddressId: string): Promise<T> {
    return this.request(`/geography/service-addresses/${serviceAddressId}/context`);
  }
  findRoster<T>(serviceRegionId: string, serviceDate: string): Promise<T | null> {
    return this.request(`/roster/daily?${new URLSearchParams({ serviceRegionId, serviceDate })}`);
  }
  generateRoster<T>(serviceRegionId: string, serviceDate: string): Promise<T> {
    return this.request(
      "/roster/generate",
      { method: "POST", body: JSON.stringify({ serviceRegionId, serviceDate }) },
      true
    );
  }
  validateRoster<T>(operationalDayId: string): Promise<T> {
    return this.request(
      `/roster/operational-days/${operationalDayId}/validate`,
      { method: "POST", body: "{}" },
      true
    );
  }
  transitionRoster<T>(operationalDayId: string, body: unknown): Promise<T> {
    return this.request(
      `/roster/operational-days/${operationalDayId}/transition`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  updateRosterEntry<T>(entryId: string, body: unknown): Promise<T> {
    return this.request(
      `/roster/entries/${entryId}`,
      { method: "PUT", body: JSON.stringify(body) },
      true
    );
  }
  availabilityWindows<T>(serviceRegionId: string, from: string, to: string): Promise<T> {
    return this.request(
      `/availability/windows?${new URLSearchParams({ serviceRegionId, from, to })}`
    );
  }
  saveAvailability<T>(kind: "staff" | "vehicle", body: unknown, id?: string): Promise<T> {
    return this.request(
      `/availability/${kind}${id ? `/${id}` : ""}`,
      { method: id ? "PUT" : "POST", body: JSON.stringify(body) },
      true
    );
  }
  removeAvailability<T>(kind: "staff" | "vehicle", id: string): Promise<T> {
    return this.request(`/availability/${kind}/${id}`, { method: "DELETE" }, true);
  }
  findRoutePlan<T>(serviceRegionId: string, serviceDate: string): Promise<T | null> {
    return this.request(`/route-plans?${new URLSearchParams({ serviceRegionId, serviceDate })}`);
  }
  generateRoutePlan<T>(operationalDayId: string): Promise<T> {
    return this.request(
      "/route-plans/generate",
      { method: "POST", body: JSON.stringify({ operationalDayId }) },
      true
    );
  }
  validateRouteVersion<T>(routeVersionId: string): Promise<T> {
    return this.request(
      `/route-versions/${routeVersionId}/validate`,
      { method: "POST", body: "{}" },
      true
    );
  }
  transitionRouteVersion<T>(
    routeVersionId: string,
    target: "ready" | "publish",
    expectedUpdatedAt: string
  ): Promise<T> {
    return this.request(
      `/route-versions/${routeVersionId}/${target}`,
      { method: "POST", body: JSON.stringify({ expectedUpdatedAt }) },
      true
    );
  }
  replanRoutePlan<T>(routePlanId: string, body: unknown): Promise<T> {
    return this.request(
      `/route-plans/${routePlanId}/replan`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  moveRouteStop<T>(routeVersionId: string, stopId: string, body: unknown): Promise<T> {
    return this.request(
      `/route-versions/${routeVersionId}/stops/${stopId}/move`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  private async request<T>(path: string, init: RequestInit = {}, write = false): Promise<T> {
    const token = await this.options.accessToken();
    const correlationId = crypto.randomUUID();
    const response = await this.fetcher(
      `${this.options.baseUrl.replace(/\/$/, "")}${API_BASE_PATH}${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": correlationId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(write ? { "Idempotency-Key": crypto.randomUUID() } : {}),
          ...init.headers
        }
      }
    );
    const result = (await response.json()) as ApiResult<T>;
    if (!result.ok)
      throw Object.assign(new Error(result.error.message), {
        apiError: result.error,
        status: response.status
      });
    return result.data;
  }
}
