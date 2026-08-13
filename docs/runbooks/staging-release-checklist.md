# Staging Release Checklist

- [ ] Requested SHA is contained in `main`; CI and Security are green.
- [ ] Target GitHub Environment and Supabase project identity are verified.
- [ ] Configuration validation passes without printing values.
- [ ] Migration inventory, guarded SQL review and dry-run are accepted.
- [ ] Backup/recovery posture and last known-good artifacts are referenced.
- [ ] Migrations and remote schema lint pass.
- [ ] Only tracked Functions are deployed and healthy.
- [ ] Exact Office/Driver artifacts are deployed to separate HTTPS hosts.
- [ ] Environment banner and SHA/deployment identity match the workflow.
- [ ] Remote smoke, Auth connectivity, denial sanity and fake-provider safety pass.
- [ ] Monitoring is checked and alert ownership is known.
- [ ] Failed-release/rollback references and release summary are recorded.
