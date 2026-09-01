#!/usr/bin/env pwsh
# Reload the Railway STAGING database from a PRODUCTION dump, so the sandbox
# agency staff sign into shows their own data.
#
# Prefer scripts/refresh-staging.ps1 over calling this directly. The refresh is
# the gated job: it refuses the clone unless prod and staging already hold the
# same schema, runs this, then applies any migration the reload rolled back. The
# gate is the point. A dump carries prod's `schema_migrations` as well as prod's
# schema, so reloading staging while a migration is soaking on it erases that
# migration and leaves the deployed branch running against a schema behind it.
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
# LEAVE STAGING'S ELECTRIC RUNNING. This resets the target with
# `DROP SCHEMA public CASCADE` (not DROP DATABASE), which leaves Electric's
# replication slot intact and needs no exclusive access, and Electric only adds
# tables to its publication when a shape is requested, which will not happen
# mid-clone. Running is not merely tolerable, it is a requirement: staging sets
# `max_slot_wal_keep_size = 2048MB` where prod is `-1`, the restore writes WAL
# on the order of a gigabyte against that ceiling, and a stopped Electric stops
# advancing its slot, so the WAL piles up behind it until Postgres invalidates
# the slot. Redeploy Electric AFTER the reload for a clean re-snapshot; its
# stored shape state predates the reset.
#
# Staging keeps prod's WHOLE history, which is cheaper than trimming it, not
# dearer: the dump and the restore run at full volume either way, and the trim
# is 1.17M deletes and eleven full-table rewrites on top (#371). The three-year
# prune is local dev's, in scripts/clone-prod-db.ps1.
#
# Nor is there a WorkOS relink any more. Staging authenticates against WorkOS
# PRODUCTION (#377), so the production ids the dump carries are the ids staging
# wants. Local dev still signs in against WorkOS staging and still relinks;
# that map lives in scripts/clone-prod-db.ps1.
#
# Usage (PowerShell, from repo root):
#   $env:PROD_DATABASE_URL    = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'   # prod public proxy
#   $env:STAGING_DATABASE_URL = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'   # staging public proxy
#   ./scripts/clone-prod-to-staging.ps1
#
# This script carries no `sslmode` check of its own, and does not want one:
# pg_dump, pg_restore and psql default to `prefer` and negotiate down against
# Railway's TCP proxy, so a URL without it works here. dbmate does not, which is
# why scripts/refresh-staging.ps1 refuses at the top instead (#405).
#
# The clone checks that the data arrived. Every ordinary table in `public` is
# counted on prod and on staging, and staging holding fewer rows than prod fails
# the run. Two things about that check are worth knowing before you change it:
#
#   - The prod baseline is read before the dump, not after the restore. Prod
#     keeps taking writes, and a row written during the dump reaches staging
#     without reaching the baseline. Counting first makes that drift a surplus,
#     which is ignored, instead of a phantom shortfall, which would cry wolf.
#   - `spatial_ref_sys` is allowed to differ, and it is the only one.
#     scripts/lib/table-row-counts.ps1 holds that list with the reason beside it.
#
# This is what pg_restore's discarded exit code would have told us. The exit code
# cannot: PostGIS makes it non-zero on every healthy run. See issue #347, and
# #310 for the four days a missing count cost.

[CmdletBinding()]
param(
	[string]$ProdUrl = $env:PROD_DATABASE_URL,
	[string]$StagingUrl = $env:STAGING_DATABASE_URL,
	[string]$PgBin,
	# Skip the interactive "this wipes staging" confirmation. refresh-staging.ps1
	# passes it, having asked once for the whole job.
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

$rowCountLibPath = Join-Path $PSScriptRoot 'lib/table-row-counts.ps1'
if (-not (Test-Path $rowCountLibPath)) { throw "Missing $rowCountLibPath, which the post-restore row-count check runs." }
. $rowCountLibPath

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
Write-Host '    History:            all of it' -ForegroundColor DarkGray
Write-Host '    Staging Electric:   must be RUNNING; do not stop it (see the header)' -ForegroundColor DarkGray
if (-not $Yes) {
	Write-Host ''
	Write-Host '    Type "yes" to wipe + reload the staging database.' -ForegroundColor Yellow
	if ((Read-Host 'Proceed?') -ne 'yes') { throw 'Aborted by user.' }
}

$dumpFile = Join-Path ([System.IO.Path]::GetTempPath()) "prod-$stagingDbName.dump"

try {
	Write-Host '==> Counting prod tables (read-only) for the post-restore comparison ...' -ForegroundColor Cyan
	# One sequential scan per table, on top of the one pg_dump is about to do
	# anyway. Read before the dump so concurrent prod writes can only inflate
	# staging, never fake a shortfall.
	$prodOutput = & $psql $ProdUrl -X -A -t -F '|' -v ON_ERROR_STOP=1 -c $PublicTableRowCountSql
	if ($LASTEXITCODE -ne 0) { throw "prod row-count query failed (exit $LASTEXITCODE)" }
	$prodCounts = ConvertTo-TableRowCountMap -PsqlOutput $prodOutput
	Write-Host "    $($prodCounts.Count) tables counted." -ForegroundColor DarkGray

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

	Write-Host '==> Verifying every table arrived ...' -ForegroundColor Cyan
	$stagingOutput = & $psql $StagingUrl -X -A -t -F '|' -v ON_ERROR_STOP=1 -c $PublicTableRowCountSql
	if ($LASTEXITCODE -ne 0) { throw "staging row-count query failed (exit $LASTEXITCODE)" }
	$stagingCounts = ConvertTo-TableRowCountMap -PsqlOutput $stagingOutput
	# Failing here leaves staging holding a partial reload and no migrations
	# reapplied, so the advice has to say so: the sandbox is not usable until a
	# clone finishes.
	Assert-NoTableRowCountShortfall -SourceCounts $prodCounts -TargetCounts $stagingCounts `
		-SourceLabel 'prod' -TargetLabel 'staging' `
		-FailureAdvice 'Staging holds a partial reload and no migrations have been reapplied; the sandbox is not usable. Read the pg_restore output above for the failing table and re-run the refresh.'

	# pg_restore leaves no statistics behind, and the planner reads what it finds.
	# Autoanalyze catches up within a minute or so, but a run that ends with the
	# planner already correct is one nobody has to reason about (#371).
	Write-Host '==> Analyzing (pg_restore leaves no statistics; this makes the finish deterministic) ...' -ForegroundColor Cyan
	& $psql $StagingUrl -X -v ON_ERROR_STOP=1 -c 'vacuum (analyze)'
	if ($LASTEXITCODE -ne 0) { throw "vacuum (analyze) failed (exit $LASTEXITCODE)" }
}
finally {
	if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host 'Done. Staging DB now mirrors prod.' -ForegroundColor Green
