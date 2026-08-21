# Office Web Navigation and Request Context

## Contract

Office Web is a single-page application with a stable URL for every major workspace. The root query parameter `module` identifies the workspace. Operational region and date context use the non-sensitive `region` and `date` parameters. Message content, editor values, credentials and other sensitive form state must never be placed in the URL.

The shell owns History API navigation, Back/Forward restoration, authentication bootstrap and workspace mount identity. A routine Supabase token refresh maintains authentication only; it must not reload the profile, remount the active workspace or discard editor state. A genuine sign-out or unrecoverable session restoration clears privileged content before rendering the login boundary.

Each navigation creates a new mount generation and a detached workspace root. Async work from an earlier generation may complete, but it cannot repaint the current application root. Daily Roster, Route Planning and Route Operations additionally use per-workspace request generations. A response is renderable only when both its request generation and workspace mount remain current.

Changing module, region or date clears the previous result and presents an explicit loading state. Daily Roster and Route Planning persist the selected region/date after a successful context selection; Route Operations restores and loads its selected context on reload.

## Unsaved forms

Inputs in an open dialog are marked dirty after user editing. User-driven module navigation, Back/Forward and browser unload require confirmation before discarding that state. Background authentication maintenance does not navigate or rerender and therefore cannot discard an editor. Successful saves explicitly clean the form before authoritative refresh.

## Routed workspaces

The routed shell covers Master Data resources, Geography, Daily Roster, Route Planning, Route Operations, Live Vehicles, Live Operations, Website Intake, Client Migration, Accounting, Financial Eligibility, Communications and Client SKIP. Permission-aware navigation remains presentation behavior only; API authorization and RLS remain authoritative.

## Verification

Browser coverage must include direct links, reload, Back/Forward, region/date restoration, token renewal, dirty editors, out-of-order date responses and navigation during in-flight requests. In particular, a Friday response may never appear under Monday controls, and an unmounted workspace may never replace the active module.
