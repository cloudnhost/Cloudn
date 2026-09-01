# CloudN Panel

A modern, production-grade hosting control panel — the **control plane** for
a future distributed hosting infrastructure. This repo contains the Panel
only; the CloudN Agent (execution plane) is a separate, future project.

```
Panel  = decides who can do what, owns all business rules
Agent  = executes what the Panel tells it to (not built yet)
```

Until the Agent exists, a fully isolated **Mock Provider** simulates node
status, provisioning, console output, and resource usage, so the rest of the
application can be built and used as if the Agent were already there.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind + TanStack Query + React Router
- **Backend**: Node.js + Express + TypeScript + Prisma
- **Database**: PostgreSQL (developed against Neon)

## Project layout

```
cloudn/
├── apps/
│   ├── web/          # React frontend — own vercel.json, own .env.example
│   │   └── vercel.json
│   └── api/           # Express API — own vercel.json, serverless entry at api/index.ts
│       ├── api/
│       │   └── index.ts
│       └── vercel.json
├── packages/    # shared types/validation (reserved for growth)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docs/        # authoritative Agent integration + Egg format specs
└── .env.example
```

## Getting started

1. **Install dependencies** (run from repo root — this is an npm workspaces monorepo):

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   cp .env apps/api/.env      # the API process reads its env from apps/api/
   cp apps/web/.env.example apps/web/.env   # optional locally — defaults to localhost:4000
   ```

   Set `DATABASE_URL` to a Postgres connection string (a free [Neon](https://neon.tech)
   database works well). `WEB_URL`/`VITE_API_URL` default to `localhost:5173`/
   `localhost:4000` respectively, which is correct for local dev out of the
   box — you only need to change them when deploying (see Deployment below).

3. **Set up the database**

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

   The seed script creates two accounts:

   | Email | Password | Role |
   |---|---|---|
   | admin@cloudn.local | CloudN!Admin123 | SUPER_ADMIN |
   | sample@cloudn.local | CloudN!Sample123 | USER (Pro plan) |

   plus starter locations, nodes, allocations, nests/eggs, plans, and a
   couple of sample servers. **These are publicly-documented passwords —
   change them (or delete the accounts) before anyone besides you can
   reach this environment.** The seed script also refuses to run at all
   when `NODE_ENV=production` unless you explicitly pass
   `FORCE_SEED=true`, specifically to stop it from being run against a
   real production database by accident.

4. **Run the app** — API and frontend as two separate processes, mirroring
   how they're deployed:

   ```bash
   npm run dev   # runs both concurrently: API on :4000, web on :5173
   ```

   Open `http://localhost:5173`. The frontend talks to the API at
   `http://localhost:4000` via `VITE_API_URL` (defaults to that if unset —
   see `apps/web/.env.example`). To run just one side (e.g. iterating on
   the frontend against an API someone else is running):

   ```bash
   npm run dev:api   # API only, http://localhost:4000
   npm run dev:web   # Vite dev server only, http://localhost:5173
   ```

## Deployment

Web and API are two **separate** deployments with two separate origins —
not a single combined server. This matters for more than just hosting:
CORS, cookies, and the frontend's API base URL are all explicit because of
it (see the "Cross-origin, for real" subsection below if you're debugging
auth).

### Vercel (recommended — two projects, one repo)

Create two Vercel projects pointing at this same repository, each with a
different **Root Directory**:

| Project | Root Directory | Config used |
|---|---|---|
| Web | `apps/web` | `apps/web/vercel.json` — static Vite build |
| API | `apps/api` | `apps/api/vercel.json` — serverless function at `apps/api/api/index.ts` |

Environment variables:

- **API project**: everything in `.env.example`'s top section —
  `DATABASE_URL`, `SESSION_SECRET`, `NODE_CREDENTIAL_ENCRYPTION_KEY`, and
  critically `WEB_URL` set to the **web project's exact deployed URL**
  (e.g. `https://cloudn-web.vercel.app`, no trailing slash; comma-separate
  if you also want a preview URL to work).
- **Web project**: `VITE_API_URL` set to the **API project's exact
  deployed URL** (e.g. `https://cloudn-api.vercel.app`).

Deploy the API project first (or at least know its URL up front) so you
can set `VITE_API_URL` correctly on the web project's first deploy — and
expect one redeploy of the API project after the web project exists, to
set `WEB_URL` correctly. After that, both can redeploy independently.

**Prisma Client on Vercel**: Vercel caches `node_modules` between builds,
which can leave a stale generated Prisma Client in place even though the
schema changed — Prisma's own runtime detects this specific situation and
throws `PrismaClientInitializationError` pointing at
[pris.ly/d/vercel-build](https://pris.ly/d/vercel-build). The fix (already
in place in `apps/api/package.json`) is a `postinstall` script that runs
`prisma generate`, since `postinstall` runs as part of the dependency-
install lifecycle Vercel always executes, regardless of its `node_modules`
cache — a `prisma generate` living only inside a custom `build` script
isn't sufficient on its own. If you ever see that error after changing
`prisma/schema.prisma`, it means this step didn't run; check that
`apps/api/package.json`'s `postinstall` script is still intact.

**Known limitation on Vercel**: the Mock Provider and Mock File Provider
(`apps/api/src/providers/mock*.ts`) hold their simulated state — console
output, provisioning progress, the in-memory mock filesystem — in a plain
JS `Map` at module scope. That's fine on a long-running Node process (self-
hosted, Docker, etc.), but a serverless function's in-memory state doesn't
reliably persist between invocations or across cold starts. Everything
that's backed by the database (users, servers, nodes, plans, eggs,
allocations, auth) works normally on Vercel; only the *mock* console/
filesystem simulation may reset unexpectedly. This isn't a bug to fix now —
it naturally goes away once the real CloudN Agent (a real, stateful,
long-running process) replaces the Mock Provider. For serverless
deployments in the meantime, prefer a self-hosted Node process (below) if
you need the mock console/file simulation to stay consistent across requests.

### Self-hosted (single Node process, alternative)

If you'd rather run everything as one process on one port (Docker, a VPS,
etc.) instead of two Vercel projects, that path still exists:

```bash
npm run build:selfhosted   # builds both apps, copies web's dist into apps/api/public
npm run start:api          # node apps/api/dist/index.js — serves the SPA and /api/* on one port
```

In this mode, `WEB_URL`/`VITE_API_URL` aren't needed (same-origin), and
`apps/api/src/app.ts`'s static-file fallback (guarded by whether
`apps/api/public` exists) takes over serving the frontend. Set
`NODE_ENV=production` explicitly — Vercel sets this automatically, but a
plain VPS/Docker host won't. If this self-hosted deployment doesn't have
HTTPS configured, also set `SAME_ORIGIN_DEPLOYMENT=true` — without it, the
session cookie's `Secure` flag (see "Cross-origin, for real" below) would
make the browser silently refuse to store the cookie over plain HTTP,
breaking login. With HTTPS configured, you can leave it unset.

### Cross-origin, for real

Because web and API are different origins in the primary (Vercel)
deployment path, a few things that "just work" same-origin need to be
correct on purpose:

- **CORS**: `apps/api/src/app.ts` checks the request's `Origin` header
  against `WEB_URL` (parsed as a comma-separated allow-list) rather than
  reflecting any origin — `credentials: true` cookies can't safely be
  paired with a wildcard/reflected origin, so this is a real allow-list,
  not a formality.
- **Session cookie**: `apps/api/src/routes/auth.routes.ts` sets
  `SameSite=None; Secure` in production. A cross-site cookie sent as
  `SameSite=Lax` (the usual default) is silently dropped by the browser —
  login would return `200 OK` but every subsequent authenticated request
  would look logged-out, which is a confusing failure mode if you don't
  know to look for it. `SameSite=None` requires `Secure` (HTTPS-only),
  which Vercel provides by default; local dev falls back to `Lax` since
  `localhost:5173` and `localhost:4000` are treated as same-site anyway.
  `SAME_ORIGIN_DEPLOYMENT=true` opts a self-hosted, same-origin, no-HTTPS
  deployment out of this policy — see "Self-hosted" above.
- **API base URL**: `apps/web/src/lib/api.ts` calls `VITE_API_URL` (an
  absolute URL) instead of a relative path — there's no same-origin
  `/api/v1/...` to fall back to once the two apps are on different
  domains.

## Agent integration readiness

Two authoritative reference documents live in `/docs`:

- `docs/CLOUDN_AGENT_INTEGRATION.md` — the full Panel↔Agent contract (auth,
  node registration, heartbeat, events, server lifecycle, files, SFTP,
  error codes).
- `docs/CLOUDN_EGG_SPEC.md` — the exact JSON format the Agent expects for
  an Egg definition.

The Agent itself is still not built (by design — see the top of this
document), but the Panel's half of this contract is now real and complete
on both sides — receiving Agent→Panel calls and making Panel→Agent calls —
not just typed stubs:

- **`apps/api/src/types/agent-contract.ts`** — TypeScript types mirroring
  both documents' wire formats verbatim.
- **Agent → Panel (receiving)**, `apps/api/src/routes/agent.routes.ts`,
  mounted at `/api/v1/agent`: real, authenticated endpoints for node
  registration, heartbeat, events, and an SFTP-authentication callback
  (§10 — the Agent posts a login attempt, the Panel checks it against the
  password hash it already stores and returns valid/invalid). A real Agent
  can call every one of these today. Node online/offline status for any
  node with `usesMockProvider: false` (i.e. a real Agent has registered)
  is heartbeat-freshness based — offline once the last heartbeat exceeds
  `HEARTBEAT_STALE_THRESHOLD_MS` (45s, per the spec's default) — while
  nodes still on the Mock Provider keep using its simulated status.
- **Panel → Agent (calling out)**, `apps/api/src/providers/agent-client.ts`:
  a single low-level HTTP client implementing every REST call in §7–§12
  (server lifecycle, resize/reallocate, console token issuance, logs,
  stats, file management, backups). `CloudNAgentProvider` and
  `CloudNAgentFileProvider` (`apps/api/src/providers/cloudn-agent*.ts`) now
  implement `InfrastructureProvider`/`FileProvider` for real through this
  client — swapping `INFRASTRUCTURE_PROVIDER=mock` to `cloudn-agent`
  routes every server/file operation at a real Agent's REST API instead of
  the simulation. Until an Agent is actually deployed at a node's
  configured host/port, these calls fail honestly with a connection error
  (`DOCKER_UNAVAILABLE`) — nothing here pretends a request to
  infrastructure that doesn't exist yet succeeded. Live console I/O (§8)
  is explicitly WebSocket-only per the spec, not REST — `sendCommand()`
  fails loudly by design in Agent mode, and `getConsoleToken()` returns the
  token + `wss://` URL a browser would need to connect directly; the Mock
  Provider returns `null` there since its console stays REST-polled.
- **Reversible node-secret storage**
  (`apps/api/src/utils/node-credential-crypto.ts`): the integration doc's
  §2.1 auth scheme uses the *same* secret in both directions, so it can't
  be one-way hashed the way a password is — the Panel must be able to
  reconstruct it to authenticate its own outbound calls. Node secrets are
  therefore AES-256-GCM encrypted at rest (`NODE_CREDENTIAL_ENCRYPTION_KEY`
  in `.env`) rather than hashed, while still never being returned by any
  API response after initial creation/regeneration.
- **`apps/api/src/services/egg-resolver.service.ts`** — translates the
  Panel's internal Egg model into the exact `AgentEggDefinition` shape
  from CLOUDN_EGG_SPEC.md §1–§2, and proactively rejects a server-creation
  request (missing required variable, invalid `configFiles` path) the same
  way the Agent's own `EGG_INVALID` validation would. Runs on every server
  creation today, and is reused by `CloudNAgentProvider.createServer` to
  build the exact payload a real Agent expects.
- **Resource & allocation changes**: `PATCH /servers/:id/resources` and
  `PATCH /servers/:id/allocation` (admin-only, audited) call
  `infrastructureProvider.updateResources`/`updateAllocation`, matching §7
  exactly — the Panel decides new limits or a new port, the provider just
  applies them.
- **SFTP credentials**: `POST /servers/:id/sftp/rotate-credentials`
  provisions a real CSPRNG password (argon2-hashed, spec's
  `<server-id>.<panel-username>` username format, shown once), which the
  Agent can validate later via the callback above. Only the SFTP
  *connection* itself is unavailable until the Agent exists, which the
  `SftpPanel` component states plainly rather than faking.

## Architecture notes

- **Mock vs. real infrastructure**: every part of the app that would talk to
  a real Agent instead calls `infrastructureProvider` (`apps/api/src/providers/index.ts`),
  which is a single switch on `INFRASTRUCTURE_PROVIDER` (`mock` | `cloudn-agent`).
  Nothing outside `apps/api/src/providers/` should ever know or care which one
  is active. When the real Agent ships, implement `CloudNAgentProvider` and
  flip the env var — no other code changes required. File access
  (`apps/api/src/providers/file.provider.ts`) follows the identical pattern
  via a separate `fileProvider` export.

- **Resource accounting is server-side only**: `apps/api/src/services/resource-accounting.service.ts`
  is the single source of truth for "how much of a plan a user has used" and
  for the full server-creation permission check (active account, plan quota,
  egg/node allow-lists, allocation availability). The frontend never computes
  or enforces these — it only displays what the API returns.

- **Plan edits never retroactively resize servers**: `Server` rows copy their
  `cpuLimit` / `ramLimitMb` / `diskLimitMb` at creation time rather than
  referencing the plan live. Admins can still bulk-migrate servers to new
  plan limits later via an explicit action — plan changes alone never do it.

- **Node credentials**: generated with a CSPRNG, stored only as an argon2
  hash + 4-character preview, and returned to the admin in plaintext exactly
  once (at creation or explicit regeneration).

- **Auth**: argon2id password hashing; opaque random session tokens in an
  httpOnly cookie, with only the SHA-256 hash stored server-side. All
  authorization checks happen in Express middleware — the frontend hiding a
  page is never treated as security.

## What's implemented vs. reserved

Implemented with real database records, real validation, and real
permission checks: public marketing site (Home/Features/Plans/About/
Contact, plans read live from the database) with a role-aware navbar; auth
with ACTIVE/SUSPENDED/BANNED/DISABLED account states; full user management
(create, edit, plan assignment/change, suspend/unsuspend, ban/unban,
password reset, role changes, delete); full server lifecycle for admins
(start/stop/restart/kill/suspend/unsuspend/delete, with suspension blocking
the owner from restarting until an admin lifts it); a server file manager
(browse/upload/download/create/edit/rename/delete/search) backed by its own
`FileProvider` abstraction, mirroring the infrastructure provider pattern;
real SFTP credential provisioning with an honestly-unavailable connection
status (see Agent integration readiness above); full node management
(create, edit, delete, enable/disable, maintenance mode with a stored
reason that blocks new provisioning, heartbeat-based online/offline status
for real nodes); full egg management (create, edit, hide/unhide, duplicate,
structured JSON import, delete blocked while servers still reference the
egg) plus a spec-compliant Egg resolver used on every server creation;
full plan management (create, edit, hide/unhide, delete — deletion never
orphans a user's or server's reference, via `onDelete: SetNull`);
allocations (incl. bulk port-range creation, plus self-service extra-port
requests bounded by plan quota); a server creation wizard where CPU/RAM/
disk are always explicitly chosen and capped at the owner's actual
remaining quota — never silently granted at the full plan amount — with
an admin-only owner picker and a per-server `countsAgainstPlan` toggle so
a complimentary or one-off server (or resize) can be excluded from an
owner's plan accounting entirely, in both directions; mock console +
resource telemetry; dashboards; activity/audit logging; and real,
authenticated node-registration/heartbeat/event receiving endpoints for
the future Agent. The whole panel is served from a single public origin
(see Deployment above).

Reserved (schema + API surface exist, UI intentionally stubbed pending the
Agent): databases, backups, schedules, billing/payments. These are
deliberately shaped so wiring in the real Agent later doesn't require
schema or API redesign — see `/api/v1/agent/register` and
`/api/v1/agent/heartbeat` in `apps/api/src/app.ts`.
