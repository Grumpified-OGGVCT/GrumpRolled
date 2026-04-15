# DevOps Process Safety

This runbook exists to prevent local process storms while finishing the MVP.

## Database Priority

1. PostgreSQL is the primary development, staging, and production database path.
2. SQLite is fallback-only for minimal smoke validation.
3. Do not treat SQLite as the default path for remaining MVP completion work.
4. If you use SQLite smoke mode, regenerate the PostgreSQL Prisma client before returning to the main path.

## Rules

1. Run one dev server only.
2. Run one runtime-heavy script only.
3. Never combine `dev`, `seed`, `knowledge:ingest`, `corpus:pipeline`, and load tests in the same window of time.
4. Treat local runtime validation as sequential work, not parallel work.

## Safe Commands

1. Start dev server:

```powershell
npm run dev
```

1. Run local defense check:

```powershell
npm run defense:check
```

1. Run grump load harness:

```powershell
npm run load:grumps
```

1. Seed database:

```powershell
npm run seed
```

1. Check Postgres readiness:

```powershell
npm run postgres:readiness
```

## Required Preflight Before Runtime Tests

1. Confirm there is not already a dev server running.
2. Confirm there is not already a load test running.
3. Confirm you are not in the middle of a Prisma migrate/reset/seed cycle.
4. Run `npm run defense:check` if the machine feels degraded or you have seen Defender warnings.
5. If local performance already feels degraded, stop and restart VS Code before continuing.

## SQLite Fallback Constraints

1. SQLite WAL allows one writer at a time.
2. High write concurrency will raise p95 and p99 latency even when the app is healthy.
3. Use SQLite for controlled fallback validation only.
4. Do not use SQLite as the main path for remaining MVP completion work.
5. Do not use SQLite to simulate production-scale parallel traffic while also editing code.

## Runtime Test Discipline

1. Start the server.
2. Wait for the server to settle.
3. Run exactly one smoke or load script.
4. Wait for completion.
5. Confirm Node process count returns to baseline.
6. Only then move to the next task.

## SSE Safety

1. SSE streams now include a maximum stream duration.
2. Heartbeats are cleaned up on abort and forced close.
3. If an SSE client disconnects badly, the server should still reclaim the interval and subscription.

## If The Machine Starts Crawling Again

1. Stop the active script.
2. Stop the dev server.
3. Confirm `node` process count returns to zero.
4. Run `npm run defense:check` and review the Defender and process sections.
5. Close extra VS Code terminal tabs.
6. Restart VS Code if memory does not recover quickly.

## Implementation Notes

1. `npm run dev` uses `scripts/dev-safe.mjs`.
2. `npm run load:grumps` uses a lock file and conservative default ceilings.
3. Lock files are ignored in git via `.grumprolled-*.lock`.
4. Canonical Postgres workflows regenerate the PostgreSQL Prisma client automatically before `dev`, `build`, `test`, and `seed`.
5. `npm run defense:check` runs a local Windows host check for Defender alerts, suspicious process counts, and active listeners.

## Host Defense Check

Use the local defense check when any of the following is true:

1. Defender reported suspicious PowerShell or script activity.
2. The machine suddenly slows down during repo work.
3. You want a before-and-after snapshot around heavy scripts or runtime tests.

Runbook: [docs/runbooks/windows-defense-check.md](docs/runbooks/windows-defense-check.md)
