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
  | "stale_assignment_revision"
  | "invalid_lifecycle_transition"
  | "operation_already_started"
  | "published_route_version_required"
  | "not_found"
  | "rate_limited"
  | "reconciliation_conflict"
  | "stale_accounting_data"
  | "provider_authentication"
  | "sync_running"
  | "sync_failed"
  | "stale_financial_decision"
  | "communication_suppressed"
  | "stale_skip_review"
  | "skip_conflict"
  | "invalid_destination"
  | "provider_callback_rejected"
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
  unassignRouteStop<T>(routeVersionId: string, stopId: string, reason: string): Promise<T> {
    return this.request(
      `/route-versions/${routeVersionId}/stops/${stopId}/unassign`,
      { method: "POST", body: JSON.stringify({ reason }) },
      true
    );
  }
  assignRouteService<T>(routeVersionId: string, unassignedId: string, body: unknown): Promise<T> {
    return this.request(
      `/route-versions/${routeVersionId}/unassigned/${unassignedId}/assign`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  updateRouteStartTime<T>(routeVersionId: string, routeId: string, body: unknown): Promise<T> {
    return this.request(
      `/route-versions/${routeVersionId}/routes/${routeId}/start-time`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  startRouteOptimization<T>(sourceVersionId: string, expectedUpdatedAt: string): Promise<T> {
    return this.request(
      "/route-optimizations",
      { method: "POST", body: JSON.stringify({ sourceVersionId, expectedUpdatedAt }) },
      true
    );
  }
  routeOptimization<T>(attemptId: string): Promise<T> {
    return this.request(`/route-optimizations/${attemptId}`);
  }
  acceptRouteOptimization<T>(attemptId: string, expectedSourceUpdatedAt: string): Promise<T> {
    return this.request(
      `/route-optimizations/${attemptId}/accept`,
      { method: "POST", body: JSON.stringify({ expectedSourceUpdatedAt }) },
      true
    );
  }
  rejectRouteOptimization<T>(attemptId: string, reason: string): Promise<T> {
    return this.request(
      `/route-optimizations/${attemptId}/reject`,
      { method: "POST", body: JSON.stringify({ reason }) },
      true
    );
  }
  routeProviderHealth<T>(serviceRegionId: string): Promise<T> {
    return this.request(`/route-providers/health?${new URLSearchParams({ serviceRegionId })}`);
  }
  handoffRouteOperations<T>(publishedRouteVersionId: string): Promise<T> {
    return this.request(
      "/route-operations/handoff",
      { method: "POST", body: JSON.stringify({ publishedRouteVersionId }) },
      true
    );
  }
  routeOperations<T>(serviceRegionId: string, serviceDate: string): Promise<T> {
    return this.request(
      `/route-operations?${new URLSearchParams({ serviceRegionId, serviceDate })}`
    );
  }
  routeOperation<T>(routeOperationId: string): Promise<T> {
    return this.request(`/route-operations/${routeOperationId}`);
  }
  reassignRouteOperation<T>(routeOperationId: string, value: unknown): Promise<T> {
    return this.request(
      `/route-operations/${routeOperationId}/reassign`,
      { method: "POST", body: JSON.stringify(value) },
      true
    );
  }
  supersedeRouteOperation<T>(routeOperationId: string, value: unknown): Promise<T> {
    return this.request(
      `/route-operations/${routeOperationId}/supersede`,
      { method: "POST", body: JSON.stringify(value) },
      true
    );
  }
  cancelRouteOperation<T>(routeOperationId: string, reason: string): Promise<T> {
    return this.request(
      `/route-operations/${routeOperationId}/cancel`,
      { method: "POST", body: JSON.stringify({ reason }) },
      true
    );
  }
  assignedRouteOperations<T>(): Promise<T> {
    return this.request("/driver/route-operations");
  }
  routeOperationManifest<T>(routeOperationId: string, deviceId?: string): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/manifest${deviceId ? `?${new URLSearchParams({ deviceId })}` : ""}`
    );
  }
  routeOperationFreshness<T>(
    routeOperationId: string,
    manifestRevision: number,
    deviceId?: string
  ): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/freshness?${new URLSearchParams({ manifestRevision: String(manifestRevision), ...(deviceId ? { deviceId } : {}) })}`
    );
  }
  submitRouteOperationAction<T>(
    routeOperationId: string,
    value: { readonly idempotencyKey: string; readonly correlationId: string } & Record<
      string,
      unknown
    >
  ): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/actions`,
      { method: "POST", body: JSON.stringify(value) },
      true,
      { idempotencyKey: value.idempotencyKey, correlationId: value.correlationId }
    );
  }
  routeOperationActionReceipt<T>(actionId: string): Promise<T> {
    return this.request(`/driver/route-operation-actions/${actionId}`);
  }
  routeOperationStops<T>(routeOperationId: string, deviceId?: string): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/stops${deviceId ? `?${new URLSearchParams({ deviceId })}` : ""}`
    );
  }
  submitRouteStopResult<T>(
    routeOperationId: string,
    stopId: string,
    value: { readonly idempotencyKey: string; readonly correlationId: string } & Record<
      string,
      unknown
    >
  ): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/stops/${stopId}/result`,
      { method: "POST", body: JSON.stringify(value) },
      true,
      value
    );
  }
  setRouteCapacity<T>(routeOperationId: string, value: unknown): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/capacity`,
      { method: "POST", body: JSON.stringify(value) },
      true
    );
  }
  routeCompletionReadiness<T>(routeOperationId: string, deviceId?: string): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/completion-readiness${deviceId ? `?${new URLSearchParams({ deviceId })}` : ""}`
    );
  }
  completeRouteOperation<T>(routeOperationId: string, value: unknown): Promise<T> {
    return this.request(
      `/driver/route-operations/${routeOperationId}/complete`,
      { method: "POST", body: JSON.stringify(value) },
      true
    );
  }
  routeExecutionProgress<T>(routeOperationId: string): Promise<T> {
    return this.request(`/route-operations/${routeOperationId}/execution`);
  }
  ownTrackingDevice<T>(): Promise<T> {
    return this.request("/driver/tracking/device");
  }
  ingestTrackingBatch<T>(
    deviceId: string,
    observations: readonly unknown[],
    identity: IdempotentRequestIdentity
  ): Promise<T> {
    return this.request(
      "/driver/tracking/observations",
      { method: "POST", body: JSON.stringify({ deviceId, observations }) },
      true,
      identity
    );
  }
  trackingDevices<T>(serviceRegionId: string): Promise<T> {
    return this.request(`/vehicle-tracking/devices?${new URLSearchParams({ serviceRegionId })}`);
  }
  registerTrackingDevice<T>(value: unknown): Promise<T> {
    return this.request(
      "/vehicle-tracking/devices",
      { method: "POST", body: JSON.stringify(value) },
      true
    );
  }
  changeTrackingDeviceLifecycle<T>(deviceId: string, target: string, reason: string): Promise<T> {
    return this.request(
      `/vehicle-tracking/devices/${deviceId}/lifecycle`,
      { method: "POST", body: JSON.stringify({ target, reason }) },
      true
    );
  }
  assignTrackingDevice<T>(deviceId: string, vehicleId: string, reason: string): Promise<T> {
    return this.request(
      `/vehicle-tracking/devices/${deviceId}/assign`,
      { method: "POST", body: JSON.stringify({ vehicleId, reason }) },
      true
    );
  }
  trackingAssignmentHistory<T>(deviceId: string): Promise<T> {
    return this.request(`/vehicle-tracking/devices/${deviceId}/assignments`);
  }
  currentVehiclePositions<T>(serviceRegionId: string): Promise<T> {
    return this.request(`/vehicle-tracking/positions?${new URLSearchParams({ serviceRegionId })}`);
  }
  liveOperations<T>(serviceRegionId: string): Promise<T> {
    return this.request(`/live-operations?${new URLSearchParams({ serviceRegionId })}`);
  }
  liveOperationsVehicle<T>(vehicleId: string): Promise<T> {
    return this.request(`/live-operations/vehicles/${vehicleId}`);
  }
  liveRouteProgress<T>(routeOperationId: string): Promise<T> {
    return this.request(`/live-operations/routes/${routeOperationId}/progress`);
  }
  operationalFacts<T>(serviceRegionId: string, status = "open"): Promise<T> {
    return this.request(
      `/operational-intelligence/facts?${new URLSearchParams({ serviceRegionId, status })}`
    );
  }
  operationalFact<T>(factId: string): Promise<T> {
    return this.request(`/operational-intelligence/facts/${factId}`);
  }
  needsAttention<T>(serviceRegionId: string, status = "open"): Promise<T> {
    return this.request(`/needs-attention?${new URLSearchParams({ serviceRegionId, status })}`);
  }
  needsAttentionItem<T>(itemId: string): Promise<T> {
    return this.request(`/needs-attention/${itemId}`);
  }
  reviewOperationalFact<T>(factId: string, action: string, reason?: string): Promise<T> {
    return this.request(
      `/operational-intelligence/facts/${factId}/${action}`,
      { method: "POST", body: JSON.stringify({ reason }) },
      true
    );
  }
  websiteIntake<T>(query = ""): Promise<T> {
    return this.request(`/website-intake${query ? `?${query}` : ""}`);
  }
  clientMigrations<T>(query = ""): Promise<T> {
    return this.request(`/client-migrations${query ? `?${query}` : ""}`);
  }
  clientMigrationDetail<T>(batchId: string): Promise<T> {
    return this.request(`/client-migrations/${batchId}`);
  }
  clientMigrationRows<T>(batchId: string, query = ""): Promise<T> {
    return this.request(`/client-migrations/${batchId}/rows${query ? `?${query}` : ""}`);
  }
  clientMigrationRowDetail<T>(rowId: string): Promise<T> {
    return this.request(`/client-migrations/rows/${rowId}`);
  }
  clientMigrationReport<T>(batchId: string): Promise<T> {
    return this.request(`/client-migrations/${batchId}/report`);
  }
  accountingHealth<T>(): Promise<T> {
    return this.request("/accounting/health");
  }
  accountingSyncRuns<T>(): Promise<T> {
    return this.request("/accounting/sync-runs");
  }
  startAccountingSync<T>(
    syncMode: "initial_full" | "incremental" | "manual_refresh" | "scheduled"
  ): Promise<T> {
    return this.request(
      "/accounting/sync-runs",
      { method: "POST", body: JSON.stringify({ syncMode }) },
      true
    );
  }
  accountingReconciliation<T>(): Promise<T> {
    return this.request("/accounting/reconciliation");
  }
  reconcileAccountingCustomer<T>(provider: string, customerId: string, body: unknown): Promise<T> {
    return this.request(
      `/accounting/reconciliation/${encodeURIComponent(provider)}/${encodeURIComponent(customerId)}`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  accountStatuses<T>(): Promise<T> {
    return this.request("/accounting/status");
  }
  clientAccounting<T>(clientId: string): Promise<T> {
    return this.request(`/accounting/clients/${clientId}`);
  }
  setAccountException<T>(clientId: string, body: unknown): Promise<T> {
    return this.request(
      `/accounting/clients/${clientId}/exception`,
      { method: "PUT", body: JSON.stringify(body) },
      true
    );
  }
  removeAccountException<T>(clientId: string, reason: string): Promise<T> {
    return this.request(
      `/accounting/clients/${clientId}/exception`,
      { method: "DELETE", body: JSON.stringify({ reason }) },
      true
    );
  }
  createClientMigration<T>(body: unknown): Promise<T> {
    return this.request("/client-migrations", { method: "POST", body: JSON.stringify(body) }, true);
  }
  actOnClientMigration<T>(
    batchId: string,
    action: "import" | "process" | "dry-run" | "bulk-review-safe" | "approve" | "activate",
    body: unknown
  ): Promise<T> {
    return this.request(
      `/client-migrations/${batchId}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  reviewClientMigrationRow<T>(rowId: string, body: unknown): Promise<T> {
    return this.request(
      `/client-migrations/rows/${rowId}/review`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  websiteIntakeDetail<T>(submissionId: string): Promise<T> {
    return this.request(`/website-intake/${submissionId}`);
  }
  reviewWebsiteIntake<T>(
    submissionId: string,
    action: "review" | "approve" | "reject" | "activate",
    body: unknown
  ): Promise<T> {
    return this.request(
      `/website-intake/${submissionId}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  private async request<T>(
    path: string,
    init: RequestInit = {},
    write = false,
    identity?: IdempotentRequestIdentity
  ): Promise<T> {
    const token = await this.options.accessToken();
    const correlationId = identity?.correlationId ?? crypto.randomUUID();
    const response = await this.fetcher(
      `${this.options.baseUrl.replace(/\/$/, "")}${API_BASE_PATH}${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": correlationId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(write ? { "Idempotency-Key": identity?.idempotencyKey ?? crypto.randomUUID() } : {}),
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
  financialEligibilityDecisions<T>(query = ""): Promise<T> {
    return this.request(`/financial-eligibility/decisions${query ? `?${query}` : ""}`);
  }
  communicationIntents<T>(query = ""): Promise<T> {
    return this.request(`/communications/intents${query ? `?${query}` : ""}`);
  }
  createCommunicationIntent<T>(body: unknown): Promise<T> {
    return this.request(
      "/communications/intents",
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  communicationTestSend<T>(body: unknown): Promise<T> {
    return this.request(
      "/communications/test-send",
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  cancelCommunicationIntent<T>(intentId: string, body: unknown): Promise<T> {
    return this.request(
      `/communications/intents/${intentId}/cancel`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  communicationTemplates<T>(): Promise<T> {
    return this.request("/communications/templates");
  }
  transitionCommunicationTemplate<T>(templateId: string, body: unknown): Promise<T> {
    return this.request(
      `/communications/templates/${templateId}/status`,
      { method: "PUT", body: JSON.stringify(body) },
      true
    );
  }
  communicationProviderHealth<T>(): Promise<T> {
    return this.request("/communications/provider-health");
  }
  inboundMessages<T>(): Promise<T> {
    return this.request("/communications/inbound");
  }
  reviewInboundMessage<T>(inboundMessageId: string, body: unknown): Promise<T> {
    return this.request(
      `/communications/inbound/${inboundMessageId}/review`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  clientSkipRequests<T>(query = ""): Promise<T> {
    return this.request(`/client-skips${query ? `?${query}` : ""}`);
  }
  clientSkipRequest<T>(requestId: string): Promise<T> {
    return this.request(`/client-skips/${requestId}`);
  }
  rematchClientSkip<T>(requestId: string, body: unknown): Promise<T> {
    return this.request(
      `/client-skips/${requestId}/rematch`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  approveClientSkip<T>(requestId: string, body: unknown): Promise<T> {
    return this.request(
      `/client-skips/${requestId}/approve`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  rejectClientSkip<T>(requestId: string, body: unknown): Promise<T> {
    return this.request(
      `/client-skips/${requestId}/reject`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  markClientSkip<T>(requestId: string, action: "duplicate" | "expire", body: unknown): Promise<T> {
    return this.request(
      `/client-skips/${requestId}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  clientSkipRouteImpact<T>(requestId: string): Promise<T> {
    return this.request(`/client-skips/${requestId}/route-impact`);
  }
  replanClientSkip<T>(requestId: string, body: unknown): Promise<T> {
    return this.request(
      `/client-skips/${requestId}/replan`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  clientSkipHistory<T>(clientServiceId: string): Promise<T> {
    return this.request(`/client-skips/${clientServiceId}/history`);
  }
  financialEligibility<T>(serviceId: string): Promise<T> {
    return this.request(`/financial-eligibility/services/${serviceId}`);
  }
  simulateFinancialEligibility<T>(serviceId: string): Promise<T> {
    return this.request(
      `/financial-eligibility/services/${serviceId}/simulate`,
      { method: "POST" },
      true
    );
  }
  holdFinancialService<T>(serviceId: string, body: unknown): Promise<T> {
    return this.request(
      `/financial-eligibility/services/${serviceId}/hold`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  releaseFinancialService<T>(serviceId: string, body: unknown): Promise<T> {
    return this.request(
      `/financial-eligibility/services/${serviceId}/release`,
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
  setFinancialEligibilityOverride<T>(serviceId: string, body: unknown): Promise<T> {
    return this.request(
      `/financial-eligibility/services/${serviceId}/override`,
      { method: "PUT", body: JSON.stringify(body) },
      true
    );
  }
  clearFinancialEligibilityOverride<T>(serviceId: string, body: unknown): Promise<T> {
    return this.request(
      `/financial-eligibility/services/${serviceId}/override`,
      { method: "DELETE", body: JSON.stringify(body) },
      true
    );
  }
  reevaluateFinancialEligibility<T>(serviceId: string): Promise<T> {
    return this.request(
      `/financial-eligibility/services/${serviceId}/reevaluate`,
      { method: "POST" },
      true
    );
  }
  startFinancialEligibilityBatch<T>(body: unknown): Promise<T> {
    return this.request(
      "/financial-eligibility/reevaluations",
      { method: "POST", body: JSON.stringify(body) },
      true
    );
  }
}
