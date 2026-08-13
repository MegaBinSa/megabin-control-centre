export type AccountingHealthStatus =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "authentication_required"
  | "disabled"
  | "unknown";

export type AccountingFailureKind =
  | "authentication"
  | "rate_limited"
  | "provider_unavailable"
  | "transient_network"
  | "invalid_response"
  | "permanent";

export interface AccountingCustomer {
  readonly externalId: string;
  readonly version: string;
  readonly modifiedAt: string;
  readonly displayName: string;
  readonly email?: string;
  readonly mobile?: string;
  readonly registrationReference?: string;
  readonly customerReference?: string;
  readonly archived: boolean;
}

export interface AccountingInvoice {
  readonly externalId: string;
  readonly customerExternalId: string;
  readonly version: string;
  readonly modifiedAt: string;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly totalMinor: number;
  readonly outstandingMinor: number;
  readonly currency: string;
  readonly status: "draft" | "open" | "partially_paid" | "paid" | "void" | "unknown";
}

export interface AccountingPayment {
  readonly externalId: string;
  readonly customerExternalId: string;
  readonly version: string;
  readonly modifiedAt: string;
  readonly paymentDate: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly reference?: string;
}

export interface AccountingAdjustment {
  readonly externalId: string;
  readonly customerExternalId: string;
  readonly version: string;
  readonly modifiedAt: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: "active" | "void";
}

export interface AccountingPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly providerMetadata: Readonly<Record<string, string | number | boolean>>;
}

export type AccountingResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly classification: AccountingFailureKind;
      readonly safeMessage: string;
      readonly retryAfterMs?: number;
    };

export interface AccountingSyncRequest {
  readonly cursor?: string;
  readonly modifiedSince?: string;
  readonly pageSize: number;
}

export interface AccountingProviderAdapter {
  readonly providerKey: string;
  health(): Promise<{ readonly status: AccountingHealthStatus; readonly summary: string }>;
  customers(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingCustomer>>>;
  invoices(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingInvoice>>>;
  payments(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingPayment>>>;
  adjustments(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingAdjustment>>>;
}

export interface FakeAccountingOptions {
  readonly failure?: AccountingFailureKind;
  readonly retryAfterMs?: number;
  readonly revision?: 1 | 2;
}

const failure = <T>(options: FakeAccountingOptions): AccountingResult<T> => ({
  ok: false,
  classification: options.failure ?? "provider_unavailable",
  safeMessage: "Synthetic accounting provider failure.",
  ...(options.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs })
});

export class FakeZohoBooksAdapter implements AccountingProviderAdapter {
  readonly providerKey = "zoho-books-fake";
  constructor(private readonly options: FakeAccountingOptions = {}) {}
  async health() {
    return this.options.failure === "authentication"
      ? { status: "authentication_required" as const, summary: "Authentication is required." }
      : this.options.failure
        ? { status: "degraded" as const, summary: "Synthetic provider degradation." }
        : { status: "healthy" as const, summary: "Deterministic fake Zoho Books adapter." };
  }
  async customers(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingCustomer>>> {
    if (this.options.failure) return failure<AccountingPage<AccountingCustomer>>(this.options);
    const all: AccountingCustomer[] = [
      {
        externalId: "ZC-100",
        version: `v${this.options.revision ?? 1}`,
        modifiedAt: "2026-08-13T06:00:00Z",
        displayName: "Existing Client",
        email: "migration-existing@example.invalid",
        mobile: "+27825550101",
        customerReference: "MGB-100",
        archived: false
      },
      {
        externalId: "ZC-200",
        version: "v1",
        modifiedAt: "2026-08-13T06:01:00Z",
        displayName: "Strong Candidate",
        email: "candidate@example.invalid",
        archived: false
      },
      {
        externalId: "ZC-300",
        version: "v1",
        modifiedAt: "2026-08-13T06:02:00Z",
        displayName: "Ambiguous Synthetic",
        mobile: "+27820000000",
        archived: false
      }
    ];
    return {
      ok: true as const,
      value: {
        items: request.modifiedSince && this.options.revision !== 2 ? [] : all,
        providerMetadata: { synthetic: true, pageSize: request.pageSize }
      }
    };
  }
  async invoices(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingInvoice>>> {
    if (this.options.failure) return failure<AccountingPage<AccountingInvoice>>(this.options);
    return {
      ok: true as const,
      value: {
        items: [
          {
            externalId: "ZI-100",
            customerExternalId: "ZC-100",
            version: `v${this.options.revision ?? 1}`,
            modifiedAt: "2026-08-13T06:10:00Z",
            invoiceNumber: "INV-SYN-100",
            issueDate: "2026-04-01",
            dueDate: "2026-05-01",
            totalMinor: 120000,
            outstandingMinor: this.options.revision === 2 ? 20000 : 70000,
            currency: "ZAR",
            status: "partially_paid"
          },
          {
            externalId: "ZI-200",
            customerExternalId: "ZC-200",
            version: "v1",
            modifiedAt: "2026-08-13T06:11:00Z",
            invoiceNumber: "INV-SYN-200",
            issueDate: "2026-08-01",
            dueDate: "2026-08-31",
            totalMinor: 45000,
            outstandingMinor: 45000,
            currency: "ZAR",
            status: "open"
          }
        ],
        providerMetadata: { synthetic: true, pageSize: request.pageSize }
      }
    };
  }
  async payments(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingPayment>>> {
    if (this.options.failure) return failure<AccountingPage<AccountingPayment>>(this.options);
    return {
      ok: true as const,
      value: {
        items: [
          {
            externalId: "ZP-100",
            customerExternalId: "ZC-100",
            version: "v1",
            modifiedAt: "2026-08-13T06:20:00Z",
            paymentDate: "2026-06-01",
            amountMinor: 50000,
            currency: "ZAR",
            reference: "PAY-SYN-100"
          }
        ],
        providerMetadata: { synthetic: true, pageSize: request.pageSize }
      }
    };
  }
  async adjustments(
    request: AccountingSyncRequest
  ): Promise<AccountingResult<AccountingPage<AccountingAdjustment>>> {
    if (this.options.failure) return failure<AccountingPage<AccountingAdjustment>>(this.options);
    return {
      ok: true as const,
      value: {
        items: [
          {
            externalId: "ZA-100",
            customerExternalId: "ZC-100",
            version: "v1",
            modifiedAt: "2026-08-13T06:30:00Z",
            amountMinor: -10000,
            currency: "ZAR",
            status: "active"
          }
        ],
        providerMetadata: { synthetic: true, pageSize: request.pageSize }
      }
    };
  }
}

export interface ZohoBooksConfiguration {
  readonly organizationId: string;
  readonly accessToken: string;
  readonly baseUrl?: string;
}

export class ZohoBooksAdapter implements AccountingProviderAdapter {
  readonly providerKey = "zoho-books";
  constructor(private readonly configuration: ZohoBooksConfiguration) {}
  async health() {
    return {
      status: "unknown" as const,
      summary: "Live Zoho Books activation requires production configuration."
    };
  }
  private unavailable<T>(): AccountingResult<T> {
    void this.configuration;
    return {
      ok: false,
      classification: "permanent",
      safeMessage: "Live Zoho Books adapter is not enabled."
    };
  }
  async customers(): Promise<AccountingResult<AccountingPage<AccountingCustomer>>> {
    return this.unavailable<AccountingPage<AccountingCustomer>>();
  }
  async invoices(): Promise<AccountingResult<AccountingPage<AccountingInvoice>>> {
    return this.unavailable<AccountingPage<AccountingInvoice>>();
  }
  async payments(): Promise<AccountingResult<AccountingPage<AccountingPayment>>> {
    return this.unavailable<AccountingPage<AccountingPayment>>();
  }
  async adjustments(): Promise<AccountingResult<AccountingPage<AccountingAdjustment>>> {
    return this.unavailable<AccountingPage<AccountingAdjustment>>();
  }
}
