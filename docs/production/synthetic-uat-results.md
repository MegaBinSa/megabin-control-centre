# Synthetic UAT Results

**Status:** UAT-OFF-001 and UAT-DRV-001 Passed; four journeys remain Not Run

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Passed | Manual protected-Staging execution completed on `2026-08-25`, release `c74bea8b7f09d572c9d1f12182d3082eca063de6`, by Shaun. See the evidence record below. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Passed | Manual protected-Staging execution on `2026-08-24`, release `c74bea8b7f09d572c9d1f12182d3082eca063de6`, by Shaun. See the evidence record below. |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

## UAT-OFF-001 — Passed

Shaun completed the Office planning journey against Shared Staging release `c74bea8b7f09d572c9d1f12182d3082eca063de6`. Existing synthetic records and immutable operational history were used throughout; no reset, reseed, duplicate generation, republish or second handoff was performed.

The region-scoped `Synthetic Staging Office` persona authenticated and reviewed the permitted active Client, Client Service `59000000-0000-0000-0000-000000000001`, Service Address `58000000-0000-0000-0000-000000000001`, effective Monday Service Configuration `d9f2d3c4-f2ee-4b43-a12f-e88e7e510a75`, Pretoria geography and Synthetic Team A readiness. The locked `2026-08-24` roster showed Ready checks passing. After F5, Daily Roster, Pretoria Test Region and `2026-08-24` were restored from `?module=daily-roster&region=51000000-0000-0000-0000-000000000001&date=2026-08-24`; no stale date appeared.

The preserved Version 2 plan was Published, not stale, and retained one route, one assigned stop, zero unassigned services and two planned drums. Planned Route Stop `7747648e-edf9-44ff-b3b1-8dd9ca27b26f` referenced the correct Client Service, address and configuration at sequence 1 with two drums and a ten-minute planned duration. Synthetic Team A and Synthetic Collection Vehicle remained assigned.

Route Operation `33cb2338-30ab-4d62-adfc-27ded32ee37b`, linked to Published Route Version `f243e985-ea9c-46bc-9673-a9d6e07af6b4`, remained `completed`: Accepted **Yes**, Started **Yes**, 1/1 stops, 0 remaining, 2/2 drums, `near_capacity`, assignment revision 1, manifest revision 1 and zero open issues. It had no cancellation, supersession, stale, conflict or review warning.

Live Operations returned zero Needs Attention and no routes, positions, operational facts or warnings. Excluding the completed operation from the live projection was consistent with the authoritative Route Operations record and did not misrepresent it. Driver financial isolation was independently demonstrated by the verified `driver_team` actor receiving `403 permission_denied` from the accounting status endpoint.

The earlier Daily Roster input-level date persistence blocker is closed by the real-browser F5 evidence above. The Sunday zero-stop operation and all other historical preparation evidence remain preserved.

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
