# Office Accounting Workflow

1. Open **Accounting** to inspect provider health, last successful sync, and run history.
2. An authorized user starts a manual incremental sync; the request returns after queuing, not after provider completion.
3. Review strong, ambiguous, unmatched, conflicting, or unknown-customer records. Link only after confirming the Client, or mark ignored/follow-up/resolve conflict with a reason.
4. Open a Client account status to inspect freshness, operational status, aging, invoices, and payments when financially authorized.
5. Apply a reasoned manual exception with an optional expiry when operational treatment needs temporary human judgment. Remove it to restore derivation.

This workspace does not replace Zoho Books and cannot edit invoices, payments, Clients, Services, routes, or holds.

## Scope-aware workspace behavior

Regional Office users see only authorized Client accounting projections and detail. The provider-administration panel explicitly states that global administration is unavailable; provider health, sync controls/history and global reconciliation are neither requested nor rendered. A global Operations Manager with the established permissions retains those controls. Financial Eligibility similarly offers individual region-authorized preview, reevaluation, hold and release actions while hiding the global `stale_review` batch action from region-only actors.

UAT fact preparation is not an Office capability. It uses the protected manual **Submit staging Accounting UAT synchronization** workflow and the dedicated `Synthetic Staging Accounting Operator`; the normal regional Office persona never receives `accounting.sync` or global scope.
