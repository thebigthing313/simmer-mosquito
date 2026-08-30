#!/usr/bin/env pwsh
# Clone the PRODUCTION database into the local Docker Postgres for read-mostly
# UI development.
#
# Safety: this only ever READS from prod (pg_dump). The restore target is the
# local Docker container's own Postgres (localhost:5432 inside the container),
# which is hard-coded below — it cannot be pointed at a remote host.
#
# Usage (PowerShell, from repo root):
#   $env:PROD_DATABASE_URL = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'
#   ./scripts/clone-prod-db.ps1
#
# PROD_DATABASE_URL must be Railway's PUBLIC/TCP-proxy connection string
# (e.g. ...proxy.rlwy.net:PORT), not the internal *.railway.internal host,
# which is not reachable from your machine.
#
# `sslmode=disable`, and it is not a shortcut. The TCP proxy forwards raw bytes
# and the Postgres behind it has SSL off, so `sslmode=require` fails the dump
# with "server does not support SSL, but SSL was required" — after this script
# has already dropped the local database, which is the worst point to fail at.
# `DATABASE_URL` in `.env` carries the same `sslmode=disable` for the same
# reason.
#
# The clone checks that the data arrived: every ordinary table in `public` is
# counted on prod and on the local database, and a local table holding fewer
# rows than prod fails the run. The prod baseline is read before the dump, so a
# row prod takes while the dump runs shows up as a surplus, which is ignored,
# rather than a phantom shortfall. `spatial_ref_sys` is allowed to differ and is
# the only one; scripts/lib/table-row-counts.ps1 holds that list and the reason.
# This is what pg_restore's exit code, non-zero on every healthy run, cannot
# tell us. See issue #347.

[CmdletBinding()]
param(
	[string]$ProdUrl = $env:PROD_DATABASE_URL,
	[string]$LocalDb = 'simmer_mosquito',
	[switch]$ResetElectric = $true
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProdUrl)) {
	throw 'PROD_DATABASE_URL is not set. Provide the prod connection string (read-only role preferred).'
}

$rowCountLibPath = Join-Path $PSScriptRoot 'lib/table-row-counts.ps1'
if (-not (Test-Path $rowCountLibPath)) { throw "Missing $rowCountLibPath, which the post-restore row-count check runs." }
. $rowCountLibPath

# Local maintenance + target connection strings, INSIDE the postgres container.
$LocalSuper = 'postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable'
$LocalTarget = "postgres://postgres:postgres@localhost:5432/$LocalDb`?sslmode=disable"

# Plain function (no param block) so native flags like -d / -T / --rm pass
# straight through to docker compose instead of being bound as PowerShell params.
function Invoke-Compose {
	& docker compose @args
	if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed (exit $LASTEXITCODE)" }
}

Write-Host '==> Ensuring local Postgres is up...' -ForegroundColor Cyan
Invoke-Compose up -d postgres
# Wait for health.
$deadline = (Get-Date).AddSeconds(60)
while ($true) {
	$state = (& docker compose ps --format '{{.Service}} {{.Health}}' postgres) -join "`n"
	if ($state -match 'healthy') { break }
	if ((Get-Date) -gt $deadline) { throw 'Postgres did not become healthy in time.' }
	Start-Sleep -Seconds 2
}

Write-Host '==> Counting prod tables (read-only) for the post-restore comparison...' -ForegroundColor Cyan
# Read before the dump, so a write prod takes mid-dump can only inflate the
# local copy. psql runs in the container, which is the only place this script
# needs pg client tools.
$prodOutput = & docker compose exec -T postgres psql "$ProdUrl" -X -A -t -F '|' -v ON_ERROR_STOP=1 -c $PublicTableRowCountSql
if ($LASTEXITCODE -ne 0) { throw "prod row-count query failed (exit $LASTEXITCODE)" }
$prodCounts = ConvertTo-TableRowCountMap -PsqlOutput $prodOutput
Write-Host "    $($prodCounts.Count) tables counted." -ForegroundColor DarkGray

if ($ResetElectric) {
	Write-Host '==> Stopping Electric (releases its replication slot before we recreate the DB)...' -ForegroundColor Cyan
	Invoke-Compose stop electric
}

Write-Host "==> Recreating local database '$LocalDb' (drops existing local data)..." -ForegroundColor Cyan
# Separate -c flags: each runs in its own transaction. DROP/CREATE DATABASE
# cannot run inside a transaction block, so they must not share one -c string.
Invoke-Compose exec -T postgres psql "$LocalSuper" -v ON_ERROR_STOP=1 `
	-c "DROP DATABASE IF EXISTS $LocalDb WITH (FORCE)" `
	-c "CREATE DATABASE $LocalDb"

Write-Host '==> Dumping prod (read-only) to a temp file in the container...' -ForegroundColor Cyan
# Dump to a file first (dash has no `pipefail`, so a pipe could hide a dump
# failure). `set -e` makes a failed pg_dump fatal — that catches a bad prod URL.
# --no-owner/--no-privileges strip prod role/ACLs; we restore as local superuser.
$dump = "set -e; pg_dump --no-owner --no-privileges --format=custom '$ProdUrl' -f /tmp/prod.dump"
Invoke-Compose exec -T postgres sh -c "$dump"

Write-Host '==> Restoring into local database...' -ForegroundColor Cyan
# pg_restore prints its own errors to stderr; benign PostGIS extension/comment
# noise is expected. We don't abort on it (exit 0) and verify at the end.
$restore = "pg_restore --no-owner --no-privileges --dbname='$LocalTarget' /tmp/prod.dump; rm -f /tmp/prod.dump; exit 0"
Invoke-Compose exec -T postgres sh -c "$restore"

Write-Host '==> Verifying every table arrived...' -ForegroundColor Cyan
$localOutput = & docker compose exec -T postgres psql "$LocalTarget" -X -A -t -F '|' -v ON_ERROR_STOP=1 -c $PublicTableRowCountSql
if ($LASTEXITCODE -ne 0) { throw "local row-count query failed (exit $LASTEXITCODE)" }
$localCounts = ConvertTo-TableRowCountMap -PsqlOutput $localOutput
Assert-NoTableRowCountShortfall -SourceCounts $prodCounts -TargetCounts $localCounts `
	-SourceLabel 'prod' -TargetLabel 'the local database' `
	-FailureAdvice 'Read the pg_restore output above for the failing table and re-run the clone.'

if ($ResetElectric) {
	Write-Host '==> Resetting Electric storage (clears stale shape log for the recreated DB)...' -ForegroundColor Cyan
	# Clear the named electric-data volume contents without removing postgres-data.
	Invoke-Compose run --rm --no-deps --entrypoint sh electric -c 'rm -rf /var/lib/electric/* /var/lib/electric/.* 2>/dev/null || true'
	Write-Host '==> Starting Electric...' -ForegroundColor Cyan
	Invoke-Compose up -d electric
}

Write-Host ''
Write-Host 'Done. Local DB now mirrors prod.' -ForegroundColor Green
Write-Host 'Next: pick an identity to impersonate from the clone:' -ForegroundColor Green
Write-Host @'

  docker compose exec -T postgres psql postgres://postgres:postgres@localhost:5432/simmer_mosquito -c "select p.display_name, m.role, u.workos_user_id, o.workos_organization_id from memberships m join users u on u.id=m.user_id join organizations o on o.id=m.organization_id join profiles p on p.id=m.profile_id where m.status='active' limit 20;"

Then set DEV_IMPERSONATE_WORKOS_USER_ID / DEV_IMPERSONATE_WORKOS_ORG_ID in your .env and restart dev:server.
'@ -ForegroundColor DarkGray
