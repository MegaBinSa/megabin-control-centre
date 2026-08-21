# Synthetic UAT Results

**Status:** UAT-DRV-001 blocked by an expired operation-date fixture; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Steps 1–4 produced the valid Monday route and handoff required by Driver UAT, but the full Office journey evidence is not yet complete. The earlier Sunday zero-stop Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains preserved historical evidence. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Blocked | On release `02ba2fb250ec59b6328cdd42ef884a48c6009a53`, Monday Route Operation `621cf930-d80d-4b6a-a4e7-44a4896a57bc` is consistently `accepted`, but Start action `38f3ab68-2498-4b6f-8956-06060cefe886` (correlation `31ff23e8-cd29-415e-b014-df51f00eb8dc`) was correctly rejected because the operation date is 2026-08-17 and the attempt occurred on 2026-08-21. Assignment revision 1 matched; manifest revision is not an Accept/Start precondition. The PWA and UAT contract failed to surface the same-day requirement, and the current-assignment feed retained expired not-started work. Preserve the operation and queued evidence. Resume with a fresh one-stop operation on its service-region current date after the eligibility/current-assignment fix is reviewed, merged, deployed and smoke-verified; do not clear IndexedDB or alter the historical operation. |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The browser CORS, region-scoped master-data and explicit resource-ID blockers are resolved. The preserved Sunday operation is not suitable for `UAT-DRV-001`: its published source contains `assignedStopCount = 0`, no stop identity and zero planned capacity. The accepted Monday operation is also preserved evidence but can no longer be started safely because its service date has passed. After deployment, it must disappear from current Driver assignments without being deleted or mutated. A fresh operation with at least one stop must be accepted and started on its actual service-region date. Neither journey is a partial Pass.
