# Local Office Development

1. Start Docker Desktop and run `pnpm supabase:start`.
2. Replay migrations and synthetic seed data with `pnpm supabase:reset`.
3. Copy `.env.example` to an ignored local environment file and supply the local Supabase URL, publishable key, and platform-runtime URL. Never use a service-role key in Office Web.
4. Run `pnpm --filter @megabin/office-web dev`.
5. Run database verification with `pnpm supabase:test:db` and the browser suite with `pnpm e2e`.

Tests must use synthetic users, clients, addresses, and vehicles. Local and staging provider settings remain capture/sandbox-only and cannot send unrestricted client messages.

Session restoration and refresh are handled by Supabase Auth. A missing, expired, or revoked session returns the user to sign-in; backend `401` responses are never treated as authorization success.
