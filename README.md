# MegaBin Control Centre

MegaBin Control Centre is the greenfield operational platform for MegaBin. It is intentionally separate from the public WordPress website.

The current repository contains the approved architecture foundation only. Application shells, Supabase resources, database tables, APIs, authentication, and operational features have not yet been created.

## Source of truth

Start with the [architecture index](docs/architecture/architecture-index.md) and the [authoritative system blueprint](docs/architecture/megabin-control-centre-system-blueprint.md).

Documents under `docs/megabin-shared/` are legacy website/source context. They help with future migration and integration work but do not override Control Centre architecture decisions.

## Repository boundary

- This repository owns the Control Centre platform and its architecture.
- The MegaBin WordPress website remains a separate system and repository.
- No secrets, production credentials, WordPress runtime files, generated builds, or local environment files belong in this repository.

## Adding a GitHub remote later

No remote is configured by this foundation task. When the repository URL is approved, add and verify it explicitly:

```powershell
git remote add origin <approved-github-repository-url>
git remote -v
git push -u origin main
```

Confirm the destination organisation and repository before pushing.

