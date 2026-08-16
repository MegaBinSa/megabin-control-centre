# Synthetic UAT Results

**Status:** UAT-OFF-001 preparation blocked by a zero-stop Sunday operation; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Release `1ee517f55e9b9eb9fc833730dc8228ba853218c0` resolved browser CORS and region-scoped master-data reads. A Sunday `2026-08-16` route was validly published and handed off with zero due stops. Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` is retained as zero-stop UAT evidence and must be cancelled, not deleted, before preparing a Monday operation with at least one assigned stop. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Not Run | Protected execution and device/network evidence required |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS and region-scoped Clients-read blockers are resolved. The preserved Sunday operation is not suitable for `UAT-DRV-001`: its published source contains `assignedStopCount = 0`, no stop identity and zero planned capacity. Resume `UAT-OFF-001` only after the cancellation control is deployed, cancel that not-started operation with a reason, and prepare the active synthetic service on a date matching its configured collection day. Publication evidence must show `assignedStopCount >= 1` and retain the planned stop identity and drum count. Neither attempt is a partial Pass.
