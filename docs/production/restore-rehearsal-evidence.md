# Restore Rehearsal Evidence

**Status:** Passed; independent verifier confirmation pending

The workflow uses a Free-plan logical database dump, never a managed backup or PITR. It binds source and target to the approved references, verifies the target is empty or previously marked disposable, restores only into that target, compares migration identity and runs authorization/integrity assertions.

Recovery rehearsal #6 completed successfully on 15 August 2026 in [GitHub Actions run 31877345920](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31877345920) from repository SHA `dcd7383594ed6a89379da35de0b5f82accd70661`. It restored a logical snapshot from Staging project `xniweqdmswzljcgkfglx` into approved disposable recovery project `ivtaoqorcryzsempsogs`.

The dump was created at `2026-08-15T09:38:24Z`. Restore ran from `2026-08-15T09:38:35Z` to `2026-08-15T09:43:31Z`: **296 seconds (4 minutes 56 seconds)**. This meets the approved four-hour RTO for this rehearsal. The evidence records source runtime build `4e471bd250a2757ca67bb0e843c2201d144ac122`, deployment `github-31738092512-1`, and migration identity `0c76b3883bf377ea2d87e64ceab72de36542480ae7f27af7bb2f620929e5c134`.

Post-restore verification passed for migration history, application schema, expected synthetic reference data, Office regional permission, Driver-to-Staff linkage, Driver denial of Office permission, Driver denial of financial permission, and critical access/RLS assertions. The artifact `staging-recovery-rehearsal-31877345920` (artifact ID `9245185010`, SHA-256 `6fb30e2c8f0b2ff8da8e30b4ed77451c5b867394fac2857a4fe91ab601462a41`) expires on 13 November 2026 under the current 90-day artifact retention.

The workflow result is Passed, but Sidney's independent verification remains `PENDING_INDEPENDENT_CONFIRMATION`. The selected `RECOVERY_POINT` is operator-supplied rehearsal identity, not proof of a retained hourly recovery point. The one-hour RPO remains `NOT_ACHIEVED`: Staging still has PITR disabled and no retained hourly logical snapshots. The 12-month assurance-evidence retention target also remains unmet.
