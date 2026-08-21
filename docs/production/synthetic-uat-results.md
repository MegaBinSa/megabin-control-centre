# Synthetic UAT Results

**Status:** UAT-DRV-001 blocked at Driver route-action reconciliation; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Steps 1–4 produced the valid Monday route and handoff required by Driver UAT, but the full Office journey evidence is not yet complete. The earlier Sunday zero-stop Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains preserved historical evidence. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Blocked | On release `50f4db4da9b311aa70355f61aa0ce0405d42d3d9`, Monday Route Operation `621cf930-d80d-4b6a-a4e7-44a4896a57bc` remains authoritatively `accepted` with one stop and two planned drums. Queue classification now reaches `0 pending`, but `driver_route_operation_manifest` still returns the immutable handoff snapshot lifecycle `available` while `driver_route_operations_current` returns `accepted`. The PWA therefore cannot converge to Start. Preserve the operation and queued evidence. Resume only after the manifest read projection overlays the authoritative lifecycle and the fix is reviewed, merged, deployed and smoke-verified; do not manually clear IndexedDB or alter the operation. |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS, region-scoped master-data and explicit resource-ID blockers are resolved. The preserved Sunday operation is not suitable for `UAT-DRV-001`: its published source contains `assignedStopCount = 0`, no stop identity and zero planned capacity. The Monday operation satisfies the fixture contract and may be resumed after deployment of the Driver reconciliation fix: a fresh authoritative manifest must show `accepted`, the duplicate action must converge to a non-pending reconciled state, Accept must be absent and Start must remain available. Neither journey is a partial Pass.
