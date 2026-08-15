# Migration Failure and Forward-Repair Runbook

1. Stop release acceptance and retain the workflow, migration preview, applied-history and error evidence.
2. Compare repository and remote migration histories without resetting or editing history.
3. Classify whether the failed migration applied nothing, applied transactionally, or left an explicitly verified partial external effect.
4. Create a new reviewed forward migration for correction. Never edit an applied migration or introduce a generic automatic down-migration.
5. Run migration safety, clean replay, pgTAP/RLS, application-schema lint and advisors on the repaired sequence.
6. Apply through the protected deployment workflow and run the full remote smoke suite.
7. Record failed/repaired release SHAs, migration versions, reviewer/operator, timestamps, verification and residual risk.

Do not corrupt shared Staging to rehearse this path. A tabletop or isolated-target rehearsal may use synthetic evidence; any real recovery requires the recovery authority and target defined in the recovery objectives register.

## Protected synthetic rehearsal

The manual `Rehearse staging database forward repair` workflow implements `FR-SEMANTIC-INVARIANT-001` only against the approved isolated recovery project. It first proves the target is the verified disposable Staging snapshot, then applies a committed synthetic semantic fault through the real Supabase migration path. The exact `MBA-FR-EXPECTED-001` verification failure authorizes the next state: applying a separate immutable forward migration. Any other result stops before repair.

The workflow must be dispatched from current `main` by Shaun's configured GitHub account and approved through the protected Environment by Sidney's configured account. Never dispatch until main-only Environment policy, required independent review, self-review prevention and disabled administrator bypass have been verified. After a failed or successful run, leave the isolated target intact. Do not down-migrate, delete history, reset Staging or automatically recycle the target. Retain the sanitized evidence. A successful automated result may be recorded as Passed, but assurance acceptance remains pending until Sidney independently confirms the post-run evidence.

## Completed rehearsal

[Run 31906816621](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31906816621) passed from current-main SHA `1f3a91ffe831e5039716a4fc5bc7fcc2a229d1e9` using recovery baseline `31877345920`. The fault migration applied to the isolated target and produced exactly `MBA-FR-EXPECTED-001`; the separate repair migration then applied and all semantic, restored-data, regional authorization, Driver isolation/linkage and critical-RLS checks passed. Source Staging migration identity was unchanged and evidence records zero Staging writes. No down migration, history deletion, reset or cleanup ran.

The isolated target intentionally remains at the repaired rehearsal state for Sidney's post-run review. It is not a clean restore baseline for another rehearsal until a separately approved recovery run recycles it. Artifact `staging-forward-repair-rehearsal-31906816621` is the bounded evidence source; its 90-day retention does not satisfy the 12-month target.
