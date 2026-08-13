# Office Client Migration Workflow

1. Select the documented `canonical-v1` mapping and import a bounded CSV containing no formulas or macros.
2. Profile and reconcile immutable rows. Review validation, deterministic Client/Address/Service matches, geography, team/day differences, and classifications.
3. Run dry-run and confirm it reports zero authoritative writes.
4. Review rows side-by-side; material overrides require a reason. Resolve conflicts rather than bulk approving them.
5. Approve the batch to freeze mapping, processing version, counts, and plans.
6. Activate. Inspect per-row outcomes and the reconciliation report; retry only technical failures.

Production files remain outside Git and this workflow does not authorize cutover.
