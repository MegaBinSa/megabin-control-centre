# UAT-FIN-001 — Passed

**Result:** Accounting and financial isolation synthetic UAT Passed on Shared Staging. This does not approve production financial enforcement, holds/releases, a pilot, or a new live Driver operation.

**Execution:** `2026-10-17T18:54:53.490Z`–`2026-10-17T18:55:21.817Z` (20:54–20:55 SAST). Codex performed automated hosted API/browser execution under the user's explicit approval of the two synthetic customer pairings and synthetic eligibility decisions.

## Release and artifacts

| Item | Evidence |
|---|---|
| Deployed main release | `7d102000b49e02e7387bdd07210e46563a53c54d` |
| Protected deployment | [39059933828](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39059933828), succeeded |
| Deployment identity | `github-39059933828-1` |
| Preparation and hosted verification | [39060114442](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39060114442), succeeded |
| Exact fixture replay | [39060282967](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39060282967), succeeded; sanitized artifact retained separately |
| Verifier source | `8d6399f3879ab5ab769076902d966029f7eccd4c`, not deployed |
| Artifact | `financial-eligibility-hosted-uat-39060114442`: sanitized `fixture.json`, `evidence.json`, and authenticated `office-financial-eligibility.png` |
| Repaired monitor | [39060117000](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39060117000), Passed; 28 alert records, all Resolved, observed exact release above |

Existing protected staging credentials stayed in runner memory. The fixed-target preparation accepts no customer IDs, arbitrary URL, SQL, request body, hold/release, route or global financial-batch input. Its only optional execution is gated by the exact release-bound pairing confirmation. The subsequent hosted verifier is read-only.

## Approved mappings and accounting projection

The user approved these test-fixture pairings; no automatic/customer-name inference was made:

| Fake customer | Existing synthetic client | Result |
|---|---|---|
| `ZC-100` | Synthetic Client One, `57000000-0000-0000-0000-000000000001` | mapped, version 1 |
| `ZC-200` | Synthetic Client Two, `57000000-0000-0000-0000-000000000002` | mapped, version 1 |
| `ZC-300` | Deliberately ambiguous; no target | remains unmatched, version 0 |

Both links went through the existing hosted reconciliation API as the global Synthetic Staging Accounting Operator (`c85c4c49-df71-4707-ab24-dfd6dd3225c1`). Exactly two `accounting.customer_link` audit facts retain correlations `59de8652-282a-44e9-8bd6-55749e522cb1` and `f3ba2aaf-8887-4453-b4b9-ce92a7e08085`.

The fixed `zoho-books-fake` provider was verified before writes. Idempotent sync identity `uat:accounting:UAT-FIN-001:mapped-projection:01` created run `5252bdd7-b330-49a4-bd9a-78fd2a729ba2`, returned `duplicate: false`, and reached `succeeded` with two fresh mapped snapshots. Immutable provider facts remained three customers, two invoices, one payment and one adjustment: no duplicate facts were introduced. The original initial sync remained unchanged.

The exact replay completed at `2026-10-17T18:57:16.919Z`, returned `duplicate: true` with that same sync run, and passed the hosted verifier again. Independent read-only reconciliation confirmed two snapshots, two link audit facts, three decisions still at version 1, and three decision events. The complete-record decision digest remained `b195d6d303a83991dc759b86e0fe3017`; the Route Operations digest also remained unchanged. Holds and jobs remained zero.

## Explicit synthetic eligibility evidence

Every policy preview was fresh, mapped and `wouldHold: false`. Only the three existing services belonging to the approved clients were explicitly reevaluated:

| Service | Current decision | Version | Stored decision ID |
|---|---|---|---|
| Client One, `59000000-0000-0000-0000-000000000001` | `hold_recommended` | 1 | `64962637-8c69-4c3c-8ddc-264154c74fd1` |
| Client One, `59000000-0000-0000-0000-000000000002` | `hold_recommended` | 1 | `6e516206-f7fd-4c1e-b70b-0165ecab5b79` |
| Client Two, `59000000-0000-0000-0000-000000000003` | `warning` | 1 | `cd527046-bad4-4789-8f15-ccf28332dc05` |

All decisions retain the accounting operator as actor. Three `FinancialEligibility.DecisionChanged` events exist. Stored decision correlations are `3ac502a7-31ad-4b95-b84e-42c50fba662d`, `54cf35a3-48ce-4720-8064-bb32382f3124` and `2d4cc5c8-9090-43d3-b918-1bc62469bb0c`; the verifier also retains distinct HTTP request correlations. These are separate identities under the existing financial handler, not asserted to be the same correlation.

`hold_recommended` is advisory: there are zero financial holds and zero financial jobs. Policy `autoHoldEnabled` and `autoReleaseEnabled` remain false. No override, hold, release or policy edit was requested.

## Hosted authority and protected work

The independently authenticated, Pretoria-scoped Office actor had `globalAccess: false`. The actual hosted Financial Eligibility list and explicit Pretoria filter returned three current decisions. An other-region filter returned zero. Regional accounting status returned `200`, and the protected operator verified both populated snapshot identities and freshness. A real Office browser loaded the direct `?module=financial-eligibility` URL and restored the populated workspace across reload; the runtime, Office and Driver frontends all reported the exact deployed SHA.

The independently authenticated Driver (`aaa27c4a-040c-40d0-83d1-6a70d446c994`, `driver_team`) received `403 authorization_denied` with no `data` or `items` from Financial Eligibility despite the now-populated list. Correlation: `5c725b95-32a7-4219-af2c-55ca1d42b694`. Accounting returned `403 permission_denied`; its own profile had no financial/master-data read permission.

Read-only before/after reconciliation retained identical ordered complete-record hashes:

| Protected state | Before and after |
|---|---|
| All Route Operations | `c047055a606edb54f9a075f8a9c96259` |
| Published Route Versions | `f235742e57c68b0edfe94e9b7b441b81` |
| Original initial accounting sync | `76d6c8aef53e2ac75e5d74580295ffe6` |

Three Draft versions and one Ready version became stale with `financial_eligibility_changed`. This is the expected review marker produced by explicit reevaluation; no version was published, handed off, reset or replanned. Published and active operational work was not rewritten.

## Preserved failures and scope limits

The earlier [hosted remediation retest](uat-fin-001-hosted-retest.md) remains part of the history: it proved route/auth fixes while projections were empty. Preparation attempts [39059106239](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39059106239) and [39059307439](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39059307439) then exposed `400 validation_failed` for existing seeded client UUIDs before mutation. Read-only checks confirmed zero links/audits/snapshots/decisions from those failures. [PR #98](https://github.com/MegaBinSa/megabin-control-centre/pull/98) corrected only the reconciliation identifier validator to match existing PostgreSQL keys, with malformed-input and permission-denial regressions; no ID was rewritten. Its exact green merged SHA was protected-deployed before retry.

[PR #96](https://github.com/MegaBinSa/megabin-control-centre/pull/96) repaired nine missing monitor alert definitions without changing smoke expectations, recipients, schedule or unknown-check failure behavior. Fresh main runs [39058905911](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39058905911) and 39060117000 passed. This restores monitor execution; it does not replace the separate human alert-delivery acknowledgement requirements.

The supplemental live Driver Accept/Start replay remains Not Run because no operation is currently assigned. Historical Driver UAT and deterministic synchronization-race coverage remain retained; no operation was manufactured to close the financial journey. `UAT-TRK-001` is the only remaining synthetic catalogue journey. Pilot and production gates remain blocked on their own approvals, real-device/provider and recovery requirements.
