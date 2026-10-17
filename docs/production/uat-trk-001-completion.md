# UAT-TRK-001 — Passed

**Result:** The bounded synthetic vehicle tracking/intelligence journey Passed on Shared Staging. All six catalogue journeys now have passing execution evidence. The aggregate UAT gate still requires human sign-off; neither pilot nor production is authorized.

**Execution:** `2026-10-17T19:42:01.186Z`–`2026-10-17T19:42:44.482Z` (21:42 SAST). Codex executed the next synthetic UAT journey at the user's instruction using protected staging credentials and fixed synthetic identities. No application deployment, schema change, role/scope grant, route action or financial action occurred.

## Release and retained artifacts

| Item | Evidence |
|---|---|
| Deployed main release | `7d102000b49e02e7387bdd07210e46563a53c54d` |
| Deployment | `github-39059933828-1`, [protected run 39059933828](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39059933828) |
| Successful read-only preflight | [39063398706](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39063398706) |
| Synthetic execution | [39063525813](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39063525813) |
| Verifier source | `88cd4ec2971f6195208d4ed3f1a9744bddd87147`, not deployed |
| Artifact | `tracking-hosted-uat-39063525813`: sanitized `evidence.json`, `driver-offline-buffer.png`, `office-live-vehicles.png`, `office-intelligence-open.png`, `office-intelligence-resolved.png` |
| Scoped draft PR | [#99](https://github.com/MegaBinSa/megabin-control-centre/pull/99), stacked on Financial evidence [#97](https://github.com/MegaBinSa/megabin-control-centre/pull/97) |

Artifacts retain safe domain identifiers, counts, correlation IDs and synthetic browser screenshots. Credentials stayed in runner memory; tokens, passwords, raw request bodies and full GPS histories are excluded. GitHub's 90-day artifact retention does not meet the separate 12-month assurance target.

## Fixture, ingestion and current position

Before execution, independent read-only checks found zero tracking devices, observations and operational facts. The application APIs registered and activated one Driver PWA device, owned by the existing Synthetic Staging Driver, and assigned it to the existing Synthetic Collection Vehicle. No conflicting device/owner/vehicle assignment was replaced.

| Identity | Value |
|---|---|
| Region | Pretoria Test Region, `51000000-0000-0000-0000-000000000001` |
| Vehicle | Synthetic Collection Vehicle / `TEST-001-GP`, `56000000-0000-0000-0000-000000000001` |
| Device | `2150691c-42a7-4e27-a989-c71bf795a90d` |
| Reserved device reference | `uat:tracking:UAT-TRK-001:driver-pwa:01` |
| Driver owner | `aaa27c4a-040c-40d0-83d1-6a70d446c994` |
| Namespace | `megabin-uat`, synthetic-only fixture metadata |

Two deterministic observations at the fixed synthetic depot were submitted newest first, then 90 seconds older. Both received `accepted`; their byte-identical repeat received `duplicate` for the same observation IDs. The current-position timestamp stayed at the newer point, its coordinates matched the fixed synthetic depot, and tracking health was `healthy`. Observation IDs were `1b74ba7d-5795-4c6a-806c-f973b3ff24db` and `0d5b3af2-2d23-4c84-8211-ff82be7397cb`. These are test observations, not measured employee locations.

The real deployed Driver PWA then queued one additional synthetic GPS point while offline, retained `1 GPS pending` across a service-worker reload, and uploaded it once after reconnect. It reached `0 GPS pending`; retained observation ID is `02ee7cb8-aa89-4229-a7c1-f82fc5ee33e3`. Logout cleared `data`, `queue` and `positions` to counts `[0,0,0]`. The browser attempted no operational write. Independent database reconciliation found exactly three immutable observations and three ingestion receipts, so duplicate retries added no rows.

## Deterministic intelligence and human-review workflow

The fixture deliberately uses one retrospective `completion_timing` classification for preserved completed synthetic operation `33cb2338-30ab-4d62-adfc-27ded32ee37b`. Its immutable manifest planned `2026-08-24T05:00:00Z`–`13:00:00Z`; the Driver actually completed it at `06:18:43.640945Z`. The real API's millisecond normalization yields `deltaSeconds: -24076.36` and classification `early`. The rule uses the actual recorded completion as its retrospective clock, not a fabricated new operational event.

No current GPS points were supplied to this historical evaluation. First/last observation references remain null. The new GPS history is not asserted to describe that completed route; ingestion retains its own existing context-selection behavior. This keeps tracking evidence, retrospective interpretation and Driver-recorded truth distinct.

The existing Operations Manager persona (`c85c4c49-df71-4707-ab24-dfd6dd3225c1`) already held processing authority. It submitted the bounded snapshot through the hosted evaluation API; no permission or scope was granted. Regional Office (`0c1eb73f-c8f8-42d2-8a8a-faabab7bead7`) used the real Live Vehicles/Live Operations browser workflow to inspect tracking and evidence, acknowledge the fact, and resolve it with a reason.

| Result | Retained evidence |
|---|---|
| Fact | `d999a863-6de8-421a-92bc-2a80be15d703`, `completion_timing`, low confidence, informational, resolved |
| Rule version | `uat:UAT-TRK-001:completion-v1` |
| Needs Attention | `83575466-aef1-4531-a14a-9bd1116f7f8e`, resolved by the regional Office actor |
| Acknowledgement correlation | `c204857b-0417-4a64-95a7-8403cee3eba6` |
| Resolution correlation | `315c71f0-c805-4896-9991-1e5f15e9974f` |
| Driver outcome | One completed `cleaned` stop, two actual drums, unchanged |
| Derived progress | One authoritative completed stop, zero inferred visited stops, zero remaining |

The evidence digest was identical before and after review. The final Office screenshot shows no open operational fact and zero Needs Attention. Five expected administrative/review audit facts exist: device registration, activation, assignment, fact acknowledgement and fact resolution. Resolution remains attributable to Office; inference did not rewrite the Driver actor or outcome.

## Privacy, permissions and protected state

The independently authenticated Driver had ingestion permission but no fleet/operational-intelligence read permission. Its five fleet/intelligence/Needs Attention reads returned `403 permission_denied` with no `data` or `items`. The independently verified regional Office actor had `globalAccess: false` and only the Pretoria scope; tracking, fact and Needs Attention queries for the other region returned `403` without data.

The hosted verifier retained identical SHA-256 digests of the complete target operation document and execution response before and after. Independent read-only database reconciliation also retained these complete-record ordered hashes:

| Protected records | Before and after MD5 |
|---|---|
| All Route Operations | `c047055a606edb54f9a075f8a9c96259` |
| All Driver stop executions | `d8eda96cbe0f5ffcaadc77087e3fad81` |
| Published Route Versions | `f235742e57c68b0edfe94e9b7b441b81` |
| Financial decisions | `b195d6d303a83991dc759b86e0fe3017` |

Financial holds and jobs remained zero. No route was accepted, started, completed, cancelled, reassigned, published or replanned by this journey.

## Verification, preserved checkpoint and remaining gates

Three focused regressions cover confirmation before authentication, exclusion of operational/financial/unrelated writes, and exactly one deterministic classification using preserved Driver truth. The protected workflow runs the full quality/build/Playwright/Edge/database suite in addition to hosted UAT. The catalogue, readiness contracts and documentation links are separately validated after evidence updates.

Both successful protected runs passed the full repository checks: 250 unit tests, 53 Playwright tests, 763 database/RLS assertions, builds and Edge Function checks. The runner's PR checks also passed CodeQL and the dependency audit. Final evidence-only edits receive another PR verification run.

Initial preflight [39063294027](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39063294027) stopped before mutation because the new runner omitted the bearer on its health request. Commit `88cd4ec` corrected the runner; the next read-only preflight passed. Independent reconciliation confirmed zero tracking devices, observations, facts or Needs Attention items after that initial failure. This was a verifier error, not a deployed application defect.

This bounded synthetic journey does not validate locked-phone/background collection, real hardware, continuous all-hours tracking, production providers, real-world intelligence calibration, privacy/legal approval, or business UAT sign-off. No physical-device movement or new live Driver operation was manufactured. All six synthetic cases have automated passing evidence; the aggregate UAT gate remains Blocked pending human sign-off. Pilot and production gates remain Blocked on their existing independent requirements.
