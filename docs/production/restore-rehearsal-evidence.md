# Restore Rehearsal Evidence

**Status:** Not Run; protected workflow pending merge

The workflow uses a Free-plan logical database dump, never a managed backup or PITR. It binds source and target to the approved references, verifies the target is empty or previously marked disposable, restores only into that target, compares migration identity and runs authorization/integrity assertions.

No dump is uploaded. Non-sensitive evidence captures recovery point, dump time, restore interval, observed RTO, source release/migration identity, operator, authorities and checks. Sidney's independent verification remains separate. The one-hour RPO remains `NOT_ACHIEVED`; observed RTO remains unmeasured until a real run succeeds.
