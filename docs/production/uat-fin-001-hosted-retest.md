# UAT-FIN-001 hosted remediation retest

**Full journey result:** Blocked on populated projection preconditions.

**Route and authorization checkpoint:** Passed against Shared Staging.

**Execution:** `2026-10-17T18:21:44.661Z`–`2026-10-17T18:22:01.536Z` (20:21–20:22 SAST), Codex automated verification authorized by the user. This is real hosted API/browser execution, not mocked/local UAT.

## Release and retained evidence

| Item | Value |
|---|---|
| Deployed main release | `6ac6210d91a9de8052f590d6e06adaae02ea4d76` |
| Remediation | [PR #92](https://github.com/MegaBinSa/megabin-control-centre/pull/92) hosted routing; [PR #93](https://github.com/MegaBinSa/megabin-control-centre/pull/93) Driver serialization; [PR #94](https://github.com/MegaBinSa/megabin-control-centre/pull/94) list permission gate |
| Protected deployment | [39056892771](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39056892771), succeeded with migration preview/application, database/persona checks, functions, both frontends and smoke checks |
| Deployment identity | `github-39056892771-1` |
| Supabase project | `xniweqdmswzljcgkfglx` |
| Applied migration | `20261017120658_enforce_financial_eligibility_list_authorization.sql` |
| Hosted verification | [39057694634](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39057694634), `hosted-financial-uat` succeeded |
| Verifier commit | `a42312f0825f3f7b1bc49ced1ca1d6405b6a4fe1` (not deployed) |
| Sanitized artifact | `financial-eligibility-hosted-uat-39057694634`: `evidence.json` and `office-financial-eligibility.png`, retained for 90 days |

The manual-only verifier uses fixed staging destinations and fixed synthetic identities. Office/Driver credentials stay in protected runner memory; no bearer, password, response-body financial data or browser trace is included in evidence. Browser runtime API calls are restricted to GET. There is no operational mutation option.

## Observed hosted results

| Check | Observation |
|---|---|
| Office identity | `0c1eb73f-c8f8-42d2-8a8a-faabab7bead7`, `office_admin`, `financial_eligibility.read`, Pretoria scope only, `globalAccess: false` |
| Runtime and frontend identity | Runtime, Office and Driver report the exact deployed main SHA above |
| Financial list | Hosted `GET /functions/v1/platform-runtime/api/v1/financial-eligibility/decisions` returned `200`, `ok: true`, zero items |
| Explicit regional list | Pretoria filter returned `200`, zero items |
| Other-region list | Other-region filter returned `200`, zero items; no row escaped the assigned scope |
| Accounting projection | Regional `GET /accounting/status` returned `200` |
| Office direct deep link | Authenticated `?module=financial-eligibility` loaded the Financial Eligibility workspace and survived reload without a sign-in/error screen; zero attempted runtime writes |
| Verified Driver | `aaa27c4a-040c-40d0-83d1-6a70d446c994`, independently confirmed `driver_team`; own profile has no financial or master-data read permission |
| Driver Financial Eligibility | HTTP `403`, `authorization_denied`, `ok: false`, no `data` or `items`; correlation `124c8f93-4683-4bdc-a6b1-02f7ef6fb045` |
| Driver Accounting | HTTP `403`, `permission_denied`, no financial data |
| Driver assignment precondition | HTTP `200`, zero assigned operations; live Accept/Start replay Not Run |

Empty live lists prove route resolution and the explicit permission boundary, but cannot demonstrate row filtering against populated cross-region financial decisions. Database tests provide separate supporting coverage; they are not substituted for this missing populated UAT scenario.

## Protected-state reconciliation

Read-only Supabase queries before and after verification returned identical complete-record hashes (ordered JSONB, MD5 for change comparison):

| Protected state | Before | After |
|---|---|---|
| All Route Operations | `c047055a606edb54f9a075f8a9c96259` | `c047055a606edb54f9a075f8a9c96259` |
| All Route Versions | `cf52cc0be149e9ee139ec886ec7936e3` | `cf52cc0be149e9ee139ec886ec7936e3` |
| Financial decisions | 0 | 0 |
| Financial jobs | 0 | 0 |
| Financial holds | 0 | 0 |

Four historical Route Operations and five Published versions remain preserved. No existing operation was reset, accepted, started, republished or rewritten for the retest. The protected deployment's existing smoke workflow submitted its normal bounded synthetic website-intake smoke request; the financial verification itself performed no operational writes.

## Retained history and remaining blockers

1. The original hosted pathname mismatch returned `404 endpoint_not_found`; PR #92 normalized at `/api/v1`. PR #94 subsequently added explicit list authorization before row filtering. The deployed verified Driver now receives the expected `403` without financial data.
2. The first verifier run [39057517965](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39057517965) already passed the Financial Eligibility checks, then failed an incorrect extra expectation that Driver's own profile should return `403`. The existing profile endpoint correctly returns the actor's own context. The verifier was corrected to inspect the verified Driver's absent financial/master-data permissions; no application behavior or permissions were changed. The first artifact remains retained.
3. Fake accounting synchronization `16943f4e-c4fa-4718-b2c8-d5581e1479d1`, identity `uat:accounting:UAT-FIN-001:fake-sync:01`, remains succeeded and preserved. It retained three customer facts, two invoice facts, one payment fact and one adjustment fact. All three reconciliations are unmatched; there are no accounting snapshots or financial decisions. Authorized populated financial projections remain untested. Mapping/reevaluation requires a separately controlled financial UAT continuation; this retest did not perform it.
4. Live Driver Accept/Start cannot be repeated against the current assignment list because it is empty. Do not reuse or rewrite completed/historical operations. The deployed serialization fix retains its deterministic 30-repetition browser and CI evidence; a future live replay requires a legitimate current-date synthetic assigned operation.
5. Post-deployment [monitor 39057047646](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39057047646) failed with the generic `MBA-STG-MON-001` execution alert. Static comparison found missing alert definitions for emitted checks, including `office_profile_cors_preflight`. `buildMonitoringEvidence` throws when a check has no definition. This is separate from the passing deployment smoke and hosted financial retest; monitoring is not declared healthy.

The route/authorization remediation checkpoint is closed by the successful hosted retest. Keep the full `UAT-FIN-001` journey Blocked until the controlled populated-projection scenario is completed and its evidence is reconciled. Keep the supplemental live Driver transition explicitly Not Run rather than manufacturing an operation.
