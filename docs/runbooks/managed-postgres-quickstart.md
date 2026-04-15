# Managed Postgres Quickstart

Use this runbook when you want GrumpRolled on PostgreSQL without installing PostgreSQL natively on Windows.

## Recommended Providers

1. Supabase free tier
   - Best fit if you expect to lean into Postgres extensions like pgvector later.
2. Neon free tier
   - Good fit if you want a lighter pure-Postgres managed service.

## What This Repo Expects

GrumpRolled already supports a managed Postgres path through `.env.postgres.local`.

Required values:

- `DATABASE_URL`
- `DIRECT_URL`
- `ADMIN_API_KEY`

The repo already loads `.env.postgres.local` in the readiness and smoke scripts.

## Fast Path

1. Provision a managed PostgreSQL database in Supabase or Neon.
2. Copy the provider connection strings.
3. Run one of the setup helpers:

```powershell
npm run db:pg:setup-managed
```

Provider shortcuts:

```powershell
npm run db:pg:setup-supabase
npm run db:pg:setup-neon
```

1. Paste `DATABASE_URL`.
2. Paste `DIRECT_URL` or press Enter to reuse `DATABASE_URL`.
3. Run the repo validation flow:

```powershell
npm run postgres:readiness
npm run db:pg:push
npm run dev:pg
npm run smoke:pg:core
```

## Notes

- `DATABASE_URL` can be a pooled or primary connection string as long as Prisma can connect successfully.
- `DIRECT_URL` should be the direct non-pooled URL when the provider gives you both. If your provider gives you only one URL, reuse it.
- Keep `.env.postgres.local` local-only.
- SQLite remains fallback-only for tiny smoke usage and export tasks.

## When To Prefer Local Docker Instead

Use Dockerized local Postgres instead of managed Postgres if:

- you need fully offline development
- you want to test network-free local behavior
- you specifically do not want cloud-hosted persistence even for dev

If you do want a native Windows PostgreSQL install, use:

```powershell
npm run db:pg:setup-local
```
