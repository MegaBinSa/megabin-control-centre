# Synthetic UAT Results

**Status:** Blocked at the first authorized Office data read; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Release `1ee517f55e9b9eb9fc833730dc8228ba853218c0`: the Staging banner, Supabase password authentication, authenticated profile bootstrap and Office navigation passed in Chrome Incognito. The first Clients read was sent without `serviceRegionId`, so the API correctly denied the region-scoped Office persona rather than granting global access. The scoped-request fix and region-scoped master-data deployment smoke gate must be reviewed, merged and deployed before the case resumes. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Not Run | Protected execution and device/network evidence required |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The first attempt's CORS blocker is resolved. The restarted `UAT-OFF-001` attempt passed browser authentication/profile bootstrap and stopped at the authorized Clients data-read boundary before any operational UAT data was created or changed. It must resume from authentication on a newly deployed release whose smoke evidence includes a successful region-scoped Clients read; neither attempt is a partial Pass.
