# GitHub Repository Controls

Protect `main` with pull requests, required `quality`, `database` and applicable Security checks, at least one appropriate review, dismissal of stale approvals, resolved conversations, no force pushes and no deletion. Restrict bypass to emergency repository administrators and audit its use.

Use GitHub Environments named `staging`, `staging-recovery` and `production`. Staging secrets/variables are isolated and deployment access belongs only to designated technical operators. Production must eventually require explicit authorized approval and must never share secrets with Staging. Phase 5B creates no Production deployment workflow.

`staging-recovery` must be restricted to `main`, prevent self-review, disable administrator bypass where supported and require the configured independent recovery verifier. The forward-repair workflow also fails closed against Environment metadata and configured authority/verifier GitHub logins before database access. Until Shaun's and Sidney's exact GitHub usernames and these protection rules are configured, the forward-repair rehearsal remains Not Run and must not be dispatched.

Supabase dashboard, hosting and database-administrator access follow least privilege. Operations users do not receive deployment/database credentials; technical access does not grant financial or communication-content permission. Review access quarterly and immediately on departure or credential compromise.

Dependency and CodeQL alerts require an assigned technical triage owner. High-severity dependency-review findings block PRs; accepted risks require a linked rationale and review date.
