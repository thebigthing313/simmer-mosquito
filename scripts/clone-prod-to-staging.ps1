#!/usr/bin/env pwsh
# Clone the PRODUCTION database into the Railway STAGING database, so local dev
# (running server + frontends locally against staging Postgres/Electric) shows
# realistic data. This is the remote-target mirror of scripts/clone-prod-db.ps1.
#
# Safety: this only ever READS from prod (pg_dump). It WIPES and reloads the
# STAGING `simmer` database — never point $STAGING_DATABASE_URL at production.
#
# Both URLs MUST be Railway PUBLIC/TCP-proxy connection strings
# (e.g. ...proxy.rlwy.net:PORT), never *.railway.internal (unreachable here).
#
# Uses locally-installed PostgreSQL client tools (pg_dump/pg_restore/psql). No
# Docker required. Auto-detects the newest C:\Program Files\PostgreSQL\*\bin, or
# pass -PgBin. A client >= the server major version (17) is required; 18 is fine.
#
# Electric does NOT need to be stopped: this resets the target with
# `DROP SCHEMA public CASCADE` (not DROP DATABASE), which leaves Electric's
# replication slot intact and does not require exclusive DB access. Electric only
# adds tables to its publication when a shape is requested, which won't happen
# mid-clone. Restart/redeploy Electric AFTER for a clean re-snapshot.
#
# Usage (PowerShell, from repo root):
#   $env:PROD_DATABASE_URL    = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'   # prod public proxy
#   $env:STAGING_DATABASE_URL = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'   # staging public proxy
#   ./scripts/clone-prod-to-staging.ps1

[CmdletBinding()]
param(
	[string]$ProdUrl = $env:PROD_DATABASE_URL,
	[string]$StagingUrl = $env:STAGING_DATABASE_URL,
	[string]$PgBin,
	# Skip the interactive "did you stop staging Electric?" pre-flight confirmation.
	[switch]$Yes
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProdUrl)) {
	throw 'PROD_DATABASE_URL is not set. Provide the prod PUBLIC proxy connection string (read-only role preferred).'
}
if ([string]::IsNullOrWhiteSpace($StagingUrl)) {
	throw 'STAGING_DATABASE_URL is not set. Provide the staging PUBLIC proxy connection string.'
}

foreach ($pair in @(@('PROD_DATABASE_URL', $ProdUrl), @('STAGING_DATABASE_URL', $StagingUrl))) {
	if ($pair[1] -match 'railway\.internal') {
		throw "$($pair[0]) points at *.railway.internal, which is not reachable from your machine. Use the PUBLIC proxy URL (*.proxy.rlwy.net:PORT)."
	}
}
if ($ProdUrl -eq $StagingUrl) {
	throw 'PROD_DATABASE_URL and STAGING_DATABASE_URL are identical. Refusing to wipe prod.'
}

# Locate pg client tools.
if ([string]::IsNullOrWhiteSpace($PgBin)) {
	$candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
		Sort-Object { [int]([regex]::Match($_.FullName, 'PostgreSQL\\(\d+)\\').Groups[1].Value) } -Descending |
		Select-Object -First 1
	if ($null -eq $candidate) {
		throw 'Could not find pg_dump under C:\Program Files\PostgreSQL\*\bin. Install the PostgreSQL client tools or pass -PgBin.'
	}
	$PgBin = Split-Path $candidate.FullName -Parent
}
$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
$psql = Join-Path $PgBin 'psql.exe'
foreach ($exe in @($pgDump, $pgRestore, $psql)) {
	if (-not (Test-Path $exe)) { throw "Missing pg tool: $exe" }
}

$stagingDbName = ([uri]$StagingUrl).AbsolutePath.TrimStart('/')

function Mask([string]$url) { $url -replace ':[^:@/]+@', ':****@' }

Write-Host '==> This will WIPE the staging database and reload it from prod.' -ForegroundColor Yellow
Write-Host "    pg tools:           $PgBin" -ForegroundColor DarkGray
Write-Host "    Source (read-only): $(Mask $ProdUrl)" -ForegroundColor DarkGray
Write-Host "    Target (WIPED):     $(Mask $StagingUrl)  (db: $stagingDbName)" -ForegroundColor DarkGray
if (-not $Yes) {
	Write-Host ''
	Write-Host '    Type "yes" to wipe + reload the staging database.' -ForegroundColor Yellow
	if ((Read-Host 'Proceed?') -ne 'yes') { throw 'Aborted by user.' }
}

$dumpFile = Join-Path ([System.IO.Path]::GetTempPath()) "prod-$stagingDbName.dump"

try {
	Write-Host "==> Dumping prod (read-only) to $dumpFile ..." -ForegroundColor Cyan
	& $pgDump --no-owner --no-privileges --format=custom $ProdUrl -f $dumpFile
	if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

	Write-Host "==> Resetting staging database '$stagingDbName' (DROP SCHEMA public CASCADE) ..." -ForegroundColor Cyan
	& $psql $StagingUrl -v ON_ERROR_STOP=1 `
		-c "DROP SCHEMA IF EXISTS public CASCADE" `
		-c "CREATE SCHEMA public"
	if ($LASTEXITCODE -ne 0) { throw "schema reset failed (exit $LASTEXITCODE)" }

	Write-Host '==> Restoring dump into staging (benign PostGIS/extension notices expected) ...' -ForegroundColor Cyan
	# pg_restore prints benign errors (extension comments etc.) to stderr; don't abort on them.
	& $pgRestore --no-owner --no-privileges --dbname=$StagingUrl $dumpFile
	Write-Host "    pg_restore exit code: $LASTEXITCODE (non-zero is usually benign extension noise)" -ForegroundColor DarkGray

	Write-Host '==> Verifying row counts ...' -ForegroundColor Cyan
	& $psql $StagingUrl -v ON_ERROR_STOP=1 `
		-c "select 'organizations' as t, count(*) from organizations union all select 'memberships', count(*) from memberships;"
	if ($LASTEXITCODE -ne 0) { throw "verification query failed (exit $LASTEXITCODE)" }
}
finally {
	if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host 'Done. Staging DB now mirrors prod.' -ForegroundColor Green
Write-Host @'

NEXT:
  1. Redeploy the staging Electric service once so it re-snapshots the reloaded
     data from a clean slate (its stored shape state predates the reset).
  2. Local .env / apps/server/.env DATABASE_URL + ELECTRIC_URL should already point
     at staging. Start the local server + web and verify a synced route renders.
'@ -ForegroundColor DarkGray
