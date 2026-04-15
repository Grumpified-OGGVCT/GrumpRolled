# Corpus Handoff Operator Runbook

## Purpose

Run The Lab research pipeline from the upstream producer into GrumpRolled without reconstructing the workflow from code.

The operator goal is simple:

1. generate a dated upstream research artifact,
2. dry-run it against GrumpRolled,
3. import it for real,
4. verify that rows actually landed.

## Active repos for this workflow

1. `C:/Users/gerry/Grumpified-AI_Research_Daily`
   Upstream producer.
2. `C:/Users/gerry/generic_workspace/GrumpRolled`
   Downstream consumer.

## Preconditions

1. GrumpRolled local API is running.
2. PostgreSQL is reachable for the GrumpRolled workspace.
3. `ADMIN_API_KEY` is available.
4. `KNOWLEDGE_AUTHOR_ID` is available.
5. The handoff is being run from the GrumpRolled workspace.

Recommended preflight:

1. `npm run postgres:readiness`
2. `npm run smoke:pg:core`

## Single-date handoff

Run one date end-to-end:

```powershell
Set-Location 'C:\Users\gerry\generic_workspace\GrumpRolled'
$envFile='.env.postgres.local'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^(?<k>[A-Z0-9_]+)="?(?<v>.*)"?$') {
    [Environment]::SetEnvironmentVariable($matches['k'], $matches['v'].Trim('"'), 'Process')
  }
}
$env:GRUMPROLLED_API_BASE='http://localhost:4692'
$env:ADMIN_API_KEY='...'
$env:KNOWLEDGE_AUTHOR_ID='...'
npm run corpus:handoff -- --date 2025-10-24
```

Dry-run only:

```powershell
npm run corpus:handoff -- --date 2025-10-24 --dry-run-only
```

## Backfill multiple dates

Inclusive range:

```powershell
npm run corpus:backfill -- --from 2025-10-24 --to 2025-10-26
```

Explicit dates:

```powershell
npm run corpus:backfill -- --dates 2025-10-24,2025-10-31
```

Continue across failures:

```powershell
npm run corpus:backfill -- --from 2025-10-24 --to 2025-10-31 --continue-on-error
```

Dry-run only across a range:

```powershell
npm run corpus:backfill -- --from 2025-10-24 --to 2025-10-26 --dry-run-only
```

## What success looks like

For a successful real import run, expect all of the following:

1. upstream aggregation finishes,
2. upstream insights mining finishes,
3. upstream report generation finishes,
4. downstream API dry-run completes,
5. downstream real import completes,
6. storage verification reports expected patterns and deltas are present.

Typical success lines:

1. `Corpus handoff complete for YYYY-MM-DD`
2. `Storage verification: patterns present=X/X; deltas present=Y/Y`

## What failure usually means

1. `Generic item envelopes are rejected by default`
   The corpus glob is too broad or a canonical envelope is being fed directly instead of the GrumpRolled adapter artifact.

2. `ADMIN_API_KEY is required`
   The local shell environment is not loaded correctly.

3. `KNOWLEDGE_AUTHOR_ID is required`
   The import author identity was not supplied.

4. `Storage verification failed`
   The API accepted the request but the expected rows did not persist to PostgreSQL.

## Output artifacts

Upstream outputs for a date:

1. `data/aggregated/YYYY-MM-DD.json`
2. `data/insights/YYYY-MM-DD.json`
3. `data/insights/YYYY-MM-DD_yield.json`
4. `data/corpus/grumprolled-YYYY-MM-DD.json`
5. `docs/reports/lab-YYYY-MM-DD.md`

Downstream storage targets:

1. `VerifiedPattern`
2. `KnowledgeDelta`

## Notes

1. The routine GrumpRolled path should ingest the adapter artifact only.
2. Broad globs that include canonical `items` envelopes are rejected by design.
3. Use dry-run-only first if you are unsure about a new backlog slice.
<!-- end -->

