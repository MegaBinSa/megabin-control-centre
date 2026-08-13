# Deployment Architecture

**Status:** Phase 5B repository-side contract

`CI` remains the prerequisite correctness gate. `Deploy staging` is a manual, serialized workflow against the protected GitHub `staging` Environment. It verifies the SHA is reachable from `main`, validates environment safety, reviews changed migrations, links only the declared project, previews and applies migrations, lints the remote schema, sets named Function secrets, deploys exactly `platform-runtime` and `website-onboarding`, builds traceable frontend artifacts and runs remote smoke tests after the hosting integration reports configured.

Failure stops subsequent steps. A migration failure prevents Functions/frontends; a Function failure prevents artifacts/smoke; missing hosting integration or smoke failure marks the deployment failed. Workflow history, commit SHA, run ID, Function deployment ID and health build metadata form the technical audit trail. No separate deployment ledger is needed.

Production has a documented contract but no active workflow. A future workflow must require a protected Production Environment, main-branch release, explicit approval, migration preview, immutable artifacts, smoke checks and rollback references. It must never be an automatic merge-to-production path.

Frontend hosting is provider-neutral in Phase 5B. CI produces immutable Office and Driver `dist` artifacts. A selected provider must consume those exact artifacts, provide separate HTTPS origins, preserve SPA routing, use safe cache headers, support rollback to an earlier artifact, inject only public `VITE_*` values, and complete before remote smoke tests.
