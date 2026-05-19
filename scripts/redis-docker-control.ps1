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

$envFile = Join-Path (Get-Location) '.env.redis.docker.local'
if (-not (Test-Path $envFile)) {
    throw 'Missing .env.redis.docker.local. Run npm run redis:setup-docker first.'
}

switch ($Action) {
    'up' {
        & docker compose --env-file .env.redis.docker.local -f docker-compose.redis.yml up -d
    }
    'down' {
        & docker compose --env-file .env.redis.docker.local -f docker-compose.redis.yml down
    }
    'logs' {
        & docker compose --env-file .env.redis.docker.local -f docker-compose.redis.yml logs -f redis
    }
}

if ($LASTEXITCODE -ne 0) {
    throw "docker compose $Action failed."
}