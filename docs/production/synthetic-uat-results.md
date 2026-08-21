# Synthetic UAT Results

**Status:** UAT-DRV-001 blocked by cross-operation Driver queue gating; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Steps 1–4 produced the valid Monday route and handoff required by Driver UAT, but the full Office journey evidence is not yet complete. The earlier Sunday zero-stop Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains preserved historical evidence. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Blocked | On release `cb0a64bf3a6bba95a073711fa5d3be807de28de8`, Friday Route Operation `b9e4f245-1f94-4aef-a6f0-17188f50854b` was accepted with one stop, one planned drum, no pending actions and authoritative Start eligibility. The PWA hid Start because rejected Monday Start action `38f3ab68-2498-4b6f-8956-06060cefe886` for expired operation `621cf930-d80d-4b6a-a4e7-44a4896a57bc` was included in a global unresolved-action control gate. Preserve both operations and the rejected IndexedDB action as evidence. Resume only after the per-operation queue-gating fix is reviewed, merged, deployed and smoke-verified; do not clear IndexedDB. |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS, region-scoped master-data, explicit resource-ID, operation-date and manifest-lifecycle blockers are resolved. The preserved Sunday zero-stop and Monday expired operations remain historical evidence. The Friday operation is the valid current UAT operation, but its controls were incorrectly gated by a terminal rejected action belonging to Monday. Historical attention must remain inspectable while current-route controls and completion synchronization are scoped to the current Route Operation. Neither journey is a partial Pass.
