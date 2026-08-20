# Synthetic UAT Results

**Status:** UAT-OFF-001 blocked at the Client Service edit identity boundary; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Browser authentication, region-scoped reads, cancellation and parent Client activation passed. On release `f324764a85cdb246af657eb812262e981879d32a`, editing seeded Client Service `59000000-0000-0000-0000-000000000001` incorrectly PATCHed parent Client ID `57000000-0000-0000-0000-000000000001` under the Client Services resource. PostgreSQL correctly denied that nonexistent service identity (`87af5fa7-1a41-45e6-b1a2-77c49aff6cf5`). The real service still derives Pretoria Test Region through its current configuration and the Office persona has regional, not global, `master_data.write`. Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains retained zero-stop evidence. Review, merge and deploy the explicit resource-ID fix before resuming; no manual Staging correction is permitted. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Not Run | Protected execution and device/network evidence required |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS, region-scoped Clients read, cancellation and Client lifecycle blockers are resolved. The preserved Sunday operation is not suitable for `UAT-DRV-001`: its published source contains `assignedStopCount = 0`, no stop identity and zero planned capacity. Resume `UAT-OFF-001` only after the explicit resource-ID fix is deployed and the seeded Client Service can be activated through its own ID. Then prepare the active synthetic service on a date matching its configured collection day. Publication evidence must show `assignedStopCount >= 1` and retain the planned stop identity and drum count. Neither attempt is a partial Pass.
