# Docker Postgres Quickstart

Use this runbook when you want GrumpRolled on PostgreSQL without:

- a native Windows PostgreSQL install
- a Supabase or Neon account
- provider connection strings

## Preconditions

1. Install Docker Desktop.
2. Ensure `docker` is on your PATH.

## Fast Path

Run:

```powershell
npm run db:pg:setup-docker
```

That command will:

1. Write `.env.postgres.local` with a local Docker PostgreSQL connection string.
2. Write `.env.postgres.docker.local` with generated local-only Docker credentials.
3. Generate a local `ADMIN_API_KEY`.
4. Start `docker-compose.postgres.yml`.

Then run:

```powershell
npm run postgres:readiness
npm run db:pg:push
npm run dev:pg
npm run smoke:pg:core
```

## Local Docker Coordinates

- Host: `localhost`
- Port: `5434`
- Database: `grumprolled`

The username and password are generated locally by `npm run db:pg:setup-docker` and stored in:

- `.env.postgres.local`
- `.env.postgres.docker.local`

They are not hardcoded into committed repo files.

## Useful Commands

Start or restart the container:

```powershell
npm run db:pg:up
```

Stop the container:

```powershell
npm run db:pg:down
```

Tail Postgres logs:

```powershell
npm run db:pg:logs
```

## Notes

- The compose file uses `pgvector/pgvector:pg16` so the local path is closer to the repo's future vector-search direction than plain PostgreSQL.
- SQLite remains fallback-only.
- If you later move to Supabase or Neon, you can replace `.env.postgres.local` with the managed-provider values and keep the rest of the repo commands unchanged.
