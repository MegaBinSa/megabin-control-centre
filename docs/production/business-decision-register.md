# Business Decision Register

**Status:** Phase 5A consolidated decision register
**Last reviewed:** 2026-08-13

| ID | Domain | Decision required | Conservative interim posture | Owner type | Needed by |
|---|---|---|---|---|---|
| BDR-OPS-001 | Operating model | Confirm regions, depots, teams, working windows, dump sites/capacity process and manual fallback. | One-region pilot; manual exception handling; no live reoptimization. | Operations/Business | Pilot design |
| BDR-IAM-001 | Roles | Approve role bundles, region/global scope and who may grant/revoke access. | Least privilege; no implicit authority for technical roles. | Business/Operations | Internal UAT |
| BDR-IAM-002 | Sensitive authority | Approve financial detail, holds/releases/overrides, message content/templates and SKIP approval roles. | Director/Admin only until explicitly delegated. | Business/Finance/Operations | Internal UAT |
| BDR-GPS-001 | Tracking outcome | Decide whether pilot accepts foreground-only tracking and which option meets all-hours production need. | Foreground pilot only with parallel fallback; no claim of all-hours reliability. | Business/Operations/Technical | Pilot |
| BDR-GPS-002 | Tracking privacy | Approve purpose, all-hours/after-hours rules, authorized viewers, notices, device ownership and lost/departure handling. | Work-hours visibility only; minimum viewers; short provisional retention. | Business/Privacy/HR | Before real tracking |
| BDR-LIV-001 | Intelligence | Approve arrival/departure/dwell/corridor/stationary/late/outside-hours thresholds and alert owners. | Shadow mode; no punitive or automatic operational action. | Operations | During pilot |
| BDR-ACC-001 | Accounting semantics | Confirm Zoho organization/customer mapping, credits, aging, multi-currency, freshness and reconciliation ownership. | Read-only facts; manual reconciliation; unknown/stale remains visible. | Finance/Business | Financial pilot |
| BDR-FIN-001 | Hold policy | Approve overdue days/amount, hold-recommend statuses, stale SLA, multi-service behavior and policy version. | Recommendation only; auto-hold disabled. | Finance/Operations | Before financial enforcement |
| BDR-FIN-002 | Hold authority | Approve force-held/eligible, release, override, dual-approval and review ownership. | Highest-authority manual action with reason/audit; no auto-release. | Business/Finance | Before financial enforcement |
| BDR-COM-001 | Channel policy | Approve operational consent/suppression, WhatsApp→SMS→email fallback timing, delivery-unknown behavior and costs. | Capture/sandbox only; no live recipients. | Business/Privacy/Operations | Before live messaging |
| BDR-COM-002 | Template governance | Approve template approvers, languages, financial-safe wording and manual-message restrictions. | Approved templates only; no free text. | Business/Finance/Operations | Before live messaging |
| BDR-SKP-001 | SKIP cutoff | Approve timezone, exact cutoff clock, near/after-cutoff treatment and expiry. | Manual Office review; never alter started operations automatically. | Operations | SKIP UAT |
| BDR-SKP-002 | SKIP ownership | Approve reviewer/approver, SLA, acknowledgement timing, automatic Draft candidate and UN-SKIP posture. | Manual review/replan; no auto-publish; UN-SKIP deferred. | Operations/Product | SKIP UAT |
| BDR-RET-001 | Retention | Approve periods and legal-hold posture for every category in the proposed matrix. | No destructive automation; restrict access and storage growth monitoring. | Business/Privacy/Finance | Production |
| BDR-DR-001 | Recovery | Approve RPO, RTO, backup/PITR tier, restore frequency and acceptable cutover downtime. | No production cutover until restore is tested. | Business/Technical | Staging design |
| BDR-PRV-001 | Providers | Approve decision criteria, budget/data handling and procurement authority for each provider register entry. | Fakes/sandboxes only. | Business/Technical | Before provider phases |
| BDR-HST-001 | Hosting | Approve frontend host, regions, domains, availability/support and cost posture. | No public production deployment. | Business/Technical | Phase 5B |
| BDR-PRI-001 | Privacy | Approve POPIA operational policy, processor review, access/correction/deletion and incident obligations. | Data minimization; synthetic data outside approved environments. | Business/Privacy/Legal | Before real data |
| BDR-ALT-001 | Alerts/support | Assign alert severities, business/operations/technical owners, support hours and after-hours escalation. | Pilot only in named support window. | Business/Operations | Pilot |
| BDR-CUT-001 | Source-of-truth cutover | Approve legacy freeze, parallel period, rollback and retirement acceptance. | Control Centre pilot scope only; legacy read-only fallback. | Business/Operations | Production Cutover |

## Proposed retention decision matrix

These are decision prompts, not approved legal periods.

| Data category | Operational need | Decision factors | Proposed control pending approval |
|---|---|---|---|
| Business audit facts | Explain privileged/business changes | Legal, dispute and accountability needs | Long-lived protected archive; no automated purge yet |
| Raw GPS | Investigate routes and calibrate intelligence | Staff privacy, storage, dispute window | Shortest useful period; separate current-position lifecycle |
| Current vehicle positions | Live operations | Staleness and privacy | Replace projection; tightly scoped access |
| Tracking health | Support device/provider health | Diagnostic value | Aggregate where possible; technical retention |
| Operational/route history | Service proof and planning analysis | Customer disputes and reporting | Preserve immutable versions under approved period |
| Driver offline receipts | Reconcile synchronization | Retry/conflict/support window | Retain through reconciliation plus approved diagnostic window |
| Website intake submissions | Activation provenance and replay | Website authority transition and PII | Preserve source evidence; restrict payload access |
| Migration source rows | Reconciliation and rollback | PII minimization and formal decommission | Protect until sign-off; delete under approved procedure |
| Accounting facts | Explain snapshots/status | Finance/legal requirements, not a ledger replacement | Preserve sufficient lineage; finance-approved period |
| Financial decisions/holds | Explain operational exclusion | Audit/dispute needs | Immutable history under business-audit policy |
| Communication attempts/content | Delivery proof versus content sensitivity | Consent, disputes, provider terms | Separate metadata/content periods; minimize rendered content |
| Inbound messages | Explain command/request | SKIP history and content sensitivity | Preserve normalized evidence for approved period |
| Technical logs | Diagnose failures | Security/operations value | Redacted, short bounded period |
| Background-job failures | Recovery and incident analysis | Replay dependencies | Retain until resolved plus bounded diagnostic period |
