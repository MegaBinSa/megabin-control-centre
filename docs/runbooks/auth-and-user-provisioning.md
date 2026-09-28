# Auth and User Provisioning Runbook

Staging users are synthetic personas from [`config/staging-personas.json`](../../config/staging-personas.json); passwords are never committed. The protected deployment resolves the two approved, confirmed Auth identities by exact email and invokes the administrator-only `app_private.provision_synthetic_staging_personas` transaction. It creates active application profiles, replaces unexpected role/scope assignments with the approved bounded assignments, links the Driver to the deterministic synthetic Staff/Team fixture and emits audit facts only when material state changes. The function rejects other identities and is not executable by `anon`, `authenticated` or `service_role`.

The deployment immediately verifies Office regional permission, absence of Office global scope, Driver denial of Office master data, role cardinality and Driver Staff/Team linkage. Authorization never uses user-editable metadata.

Normal lifecycle: invite user; verify identity; create/link Staff where applicable; assign the approved role; assign region/team scope; require MFA for Director/Admin, Operations Manager, Office/Admin and System Admin/Developer in Staging; verify effective permissions with a negative region test. Password reset uses Supabase Auth. Disabling requires session revocation/sign-out, application-profile deactivation and device reassignment/revocation. Departure follows the same order and reviews owned alerts/integration duties.

The version-controlled bootstrap SQL is a deployment-only exception, executed through the linked project Management API as database administrator. Raw interactive SQL is not an approved normal provisioning interface. Routine user administration remains `PRD-IAM-002`. Recovery when all admins are locked out requires two authorized owners using Supabase organization/project recovery, followed by audit and credential rotation.

## Synthetic accounting operator

`staging-accounting@megabin.local` is a separately created and confirmed Staging Auth identity used only by protected accounting UAT/support tooling. The deployment invokes `app_private.provision_synthetic_staging_accounting_operator`, which fail-closes for any other email, replaces unexpected roles/scopes with exactly `operations_manager` plus global scope, and audits material provisioning changes. Its password is stored only as `STAGING_ACCOUNTING_PASSWORD` in the protected GitHub `staging` Environment. This persona does not change the regional Office or Driver authorization contracts and is not a production accounting identity.
