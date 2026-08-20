# Synthetic UAT Results

**Status:** UAT-DRV-001 blocked at Driver route-action reconciliation; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Steps 1–4 produced the valid Monday route and handoff required by Driver UAT, but the full Office journey evidence is not yet complete. The earlier Sunday zero-stop Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains preserved historical evidence. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Blocked | On release `715b4f012945e8fb0dc24ae4aab2025df32b1c35`, Monday Route Operation `621cf930-d80d-4b6a-a4e7-44a4896a57bc` loaded with one stop and two planned drums. Action `cab19107-345a-450b-a07d-9a0d29efcade` accepted the route. A delayed second click created distinct action `2e7ada54-e208-4ab4-8af4-ec32cdc4108e`, correctly rejected as `invalid_lifecycle_transition`; the pre-fix PWA incorrectly counted that terminal rejection as pending and withheld authoritative refresh. The operation remains authoritatively `accepted`, with one acceptance audit fact/event, and must be preserved. Resume only after the queue/lifecycle reconciliation fix is reviewed, merged, deployed and smoke-verified; do not manually delete IndexedDB actions. |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS, region-scoped master-data and explicit resource-ID blockers are resolved. The preserved Sunday operation is not suitable for `UAT-DRV-001`: its published source contains `assignedStopCount = 0`, no stop identity and zero planned capacity. The Monday operation satisfies the fixture contract and may be resumed after deployment of the Driver reconciliation fix: a fresh authoritative manifest must show `accepted`, the duplicate action must converge to a non-pending reconciled state, Accept must be absent and Start must remain available. Neither journey is a partial Pass.
