# Migration Deployment Runbook

Use repository-ordered migrations only. Never run `db reset` during an ordinary shared-environment deployment. The workflow lists linked migration state, scans changed SQL for high-risk patterns, runs `supabase db push --linked --dry-run`, applies with `db push`, lists state again and runs linked database lint.

Guarded patterns include table/column drops, unqualified mass deletion, RLS removal, broad grants and destructive type changes. The scanner is a review aid, not a complete SQL analyzer. Findings require explicit workflow approval and human SQL review.

On failure, stop. Preserve logs and migration state, classify whether the remote transaction committed, and prefer a reviewed roll-forward migration. Do not use `migration repair`, direct Dashboard SQL or restore merely to make histories appear aligned without an incident decision and evidence.
