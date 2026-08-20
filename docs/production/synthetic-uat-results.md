# Synthetic UAT Results

**Status:** UAT-OFF-001 blocked at the master-data edit boundary; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Browser authentication, region-scoped reads and the cancellation control passed. Release `7f22ec197f898ce23dc184df35863db1fa95f850` fixed PATCH serialization, but Client activation then reached PostgreSQL and was rejected by `clients_status_timestamps` because the generic update RPC did not set `activated_at`. Correlation `487cb75c-a54f-4e5a-be82-1d3a04ed1b12` produced no committed audit/event record. Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains retained zero-stop evidence. Review, merge and deploy the lifecycle-invariant fix before resuming; no manual Staging correction is permitted. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Not Run | Protected execution and device/network evidence required |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS and region-scoped Clients-read blockers are resolved. The preserved Sunday operation is not suitable for `UAT-DRV-001`: its published source contains `assignedStopCount = 0`, no stop identity and zero planned capacity. Resume `UAT-OFF-001` only after the cancellation control is deployed, cancel that not-started operation with a reason, and prepare the active synthetic service on a date matching its configured collection day. Publication evidence must show `assignedStopCount >= 1` and retain the planned stop identity and drum count. Neither attempt is a partial Pass.
