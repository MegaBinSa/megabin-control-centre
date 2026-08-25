# Synthetic UAT Results

**Status:** UAT-DRV-001 Passed; five journeys remain Not Run or Blocked

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Release `a3a8ee46501e538ec8bce2676878a32794fd762b` restored the Daily Roster module and region after F5, but a manually selected `2026-08-24` date reverted to `2026-08-21` because URL persistence incorrectly depended on Refresh/Load. The input-level context correction is awaiting review, merge, protected deployment and real-browser verification. No Monday Route Plan was created by the rejected attempt. Earlier Sunday zero-stop Route Operation `bd07d795-294c-4051-86f9-f4b6fa2e0c0c` remains preserved historical evidence. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Passed | Manual protected-Staging execution on `2026-08-24`, release `c74bea8b7f09d572c9d1f12182d3082eca063de6`, by Shaun. See the evidence record below. |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

## UAT-DRV-001 — Passed

Shaun executed the Driver journey against Shared Staging on `2026-08-24` using the protected deployment at release `c74bea8b7f09d572c9d1f12182d3082eca063de6`. The assigned Synthetic Team A operation and all earlier unsuitable operations remain preserved; no reset, reseed or IndexedDB clearing was used.

The Driver authenticated and loaded only the assigned operation. Accept was queued while Chrome network emulation was Offline (`Offline · 1 pending`), changed local state to Accepted, and synchronized automatically within approximately ten seconds of reconnection (`Online · 0 pending`) without pressing **Sync now**. The route then started on its scheduled service date. The single stop was recorded Cleaned with two planned and two actual drums, Near Capacity was recorded, and the eligible route completed. The Driver returned to **No route assigned** after completion.

Office independently showed `completed`, Accepted **Yes**, Started **Yes**, 1/1 stops, 0 remaining, 2/2 drums, `near_capacity`, and 0 open issues. This proves the authoritative result rather than relying only on Driver-local state.

Negative authorization checks used an independently identified `Synthetic Staging Driver` / `driver_team` bearer whose permissions were limited to `route_operations.driver.act`, `route_operations.driver.read`, and `vehicle_tracking.ingest`:

- Office Staging displayed **Office access unavailable** and rendered no Office navigation or privileged/client data.
- `GET /api/v1/accounting/status` returned `403 permission_denied` and no financial data.
- `GET /api/v1/master-data/clients?serviceRegionId=51000000-0000-0000-0000-000000000001` returned `403 permission_denied` and no master data.

An intermediate `200 {items:[]}` accounting response is excluded from Driver evidence: replaying its exact bearer against `/api/v1/office/profile` proved it belonged to `Synthetic Staging Office` / `office_admin`, with regional `accounting.read` and `accounting.sensitive.read`. The accounting denial was then repeated successfully with the verified Driver token.

The browser CORS, region-scoped master-data, explicit resource-ID, operation-date, manifest-lifecycle and cross-operation queue-gating blockers encountered during preparation were resolved before this passing execution. Their preserved historical operations and terminal queue evidence were not deleted or rewritten.
