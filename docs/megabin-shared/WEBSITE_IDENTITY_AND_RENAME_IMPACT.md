# Website Identity And Rename Impact

> **Document status: legacy/source context.** This assessment concerns the separate WordPress website repository. Its repository observations do not describe the MegaBin Control Centre repository.

## Current Identity

The current project should be treated conceptually as:

```text
megabin-website
```

It is the public WordPress website and onboarding layer for MegaBin. It is not the full MegaBin software ecosystem.

## Current Local Structure Observed

Top-level project structure:

```text
.
├── .agents/
├── .git/
├── .pnpm-store/
├── assets/
├── data/
├── dist/
├── docs/
├── node_modules/
├── scripts/
├── wp-content/
├── .env.example
├── .gitignore
├── app.js
├── dev-server.mjs
├── index.html
├── package.json
├── pnpm-lock.yaml
├── README.md
└── styles.css
```

Important application folders:

- `wp-content/themes/megabin/` - custom WordPress theme.
- `wp-content/plugins/megabin-onboarding/` - custom MegaBin onboarding plugin.
- `scripts/google-apps-script/` - Google Apps Script webhook source for Sheets sync.
- `data/service-areas/` - local service-area GeoJSON source copy.
- `docs/` - project documentation.
- `dist/` - generated preview files and deployable package zips.

## Rename Assessment

No local rename was performed during this documentation task.

Reason: the workspace contains a `.git` directory entry, but Git commands from the current folder did not behave like a normal usable repository during inspection. That makes the source-control boundary unclear enough that a folder rename should be deferred until the real repository root, remote, branch state, and deployment assumptions are confirmed.

## Impact Areas

### Git

- Confirm whether the current folder is the actual repository root.
- Confirm `.git` is valid and not an incomplete synced/reparse entry.
- Confirm remote origin, current branch, uncommitted changes, and ignored files.
- A local folder rename is usually safe for Git if the `.git` metadata is intact, but this workspace needs verification first.

### Local Development

- Local preview tooling references the current working directory and serves files from this folder.
- `node_modules/`, `.pnpm-store/`, `package.json`, `dev-server.mjs`, and preview files may continue to work after a folder rename, but terminal shortcuts and any saved app/browser paths may need updating.
- Any existing local dev server should be stopped and restarted after a rename.

### WordPress

- The production/staging WordPress installation uses `wp-content/themes/megabin` and `wp-content/plugins/megabin-onboarding`.
- Those runtime folder names should not be changed as part of renaming the outer local project folder.
- WordPress options may contain URLs, page IDs, menu IDs, and upload paths that belong to the deployed site, not the local project folder.

### Deployment

- Current packaged files in `dist/` are theme/plugin zips. They do not require the outer local folder name to match `megabin-website`.
- Deployment instructions and any hosting file-manager notes may refer to this local folder by name.
- Package manifests should be regenerated after any code changes, but documentation-only folder renaming would not change package contents.

### Staging/Live Website

- Do not rename folders on staging/live except the normal plugin/theme folders if a deliberate versioned release requires it.
- The staging/live site should remain independently deployable as WordPress.
- The future Control Centre must not be placed inside the WordPress site or `wp-content`.

### Hard-Coded Paths

Verified hard-coded or configured paths are mostly relative WordPress paths:

- Service-area source: `data/service-areas/megabin-pretoria-radius-geofence.geojson`
- Plugin default service-area file: `wp-content/plugins/megabin-onboarding/data/service-areas/megabin-pretoria-radius-geofence.geojson`
- Protected uploads use WordPress upload paths at runtime.

No required runtime rule was found that depends on the outer local folder being named `MegaBin Website`, but local tooling and documents may mention that folder.

## Recommended Later Rename Procedure

1. Confirm the real Git repository root and branch state.
2. Commit or otherwise preserve all current website work.
3. Stop local preview/dev servers.
4. Rename the outer local folder to `megabin-website`.
5. Reopen the folder in Codex/editor/terminal.
6. Run a Git status check from the renamed folder.
7. Run local preview or packaging scripts.
8. Confirm generated zips still package only:
   - `wp-content/themes/megabin`
   - `wp-content/plugins/megabin-onboarding`
9. Do not alter staging/live WordPress paths merely because the local project folder was renamed.

## Decision

Do not restructure now. Treat `megabin-website` as the conceptual identity in documentation and future planning, then perform the physical rename later once source control and deployment paths are confirmed.
