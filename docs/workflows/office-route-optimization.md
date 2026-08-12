# Office Route Optimization Workflow

**Status:** Phase 2B implemented workflow

An authorized Office user loads a Route Plan and sees the current version strategy plus safe routing/optimization provider health. If the current version is eligible and fresh, **Optimize** starts an asynchronous attempt and returns its identifier. Pending or running attempts can be refreshed without holding the browser request open.

A succeeded attempt shows measurable baseline and candidate distance/duration, warnings, unassigned count, and provider-road candidate geometry. The candidate is not authoritative and is never published automatically. **Accept candidate** rechecks stale-write and permission boundaries and creates a new Draft Route Version with source lineage. **Reject** records the decision and returns the user to the unchanged baseline/manual plan.

If a provider is unhealthy, times out, is rate limited, fails, or returns an invalid result, the attempt fails safely. The source remains available as the deterministic baseline or manual planning surface, and the UI must not label it optimized. Published versions cannot be optimized in place; the user must create a new Draft/replan version and follow normal validation, Ready, and Publish transitions.
