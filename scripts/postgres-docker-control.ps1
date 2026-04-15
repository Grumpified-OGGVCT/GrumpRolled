param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('up', 'down', 'logs')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
    throw 'Docker is not installed or not on PATH.'
}

$envFile = Join-Path (Get-Location) '.env.postgres.docker.local'
if (-not (Test-Path $envFile)) {
    throw 'Missing .env.postgres.docker.local. Run npm run db:pg:setup-docker first.'
}

switch ($Action) {
    'up' {
        & docker compose --env-file .env.postgres.docker.local -f docker-compose.postgres.yml up -d
    }
    'down' {
        & docker compose --env-file .env.postgres.docker.local -f docker-compose.postgres.yml down
    }
    'logs' {
        & docker compose --env-file .env.postgres.docker.local -f docker-compose.postgres.yml logs -f postgres
    }
}

if ($LASTEXITCODE -ne 0) {
    throw "docker compose $Action failed."
}