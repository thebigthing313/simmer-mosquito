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
#   ./scripts/clone-prod-db.ps1 -YearsOfHistory 5   # keep more
#   ./scripts/clone-prod-db.ps1 -AllHistory         # keep everything
#
# This is the only clone local dev uses. The Railway staging database is a
# sandbox agency staff are signed into, so nothing local points at it.
#
# Two things happen on the restored copy that the dump cannot carry:
#
#   - The history prune. Prod runs back to 2011; the local database keeps the
#     last 3 years of DATED records (inspections, applications, collections,
#     service requests) and all reference data. See scripts/prune-history.sql.
#   - The WorkOS relink. The dump carries PRODUCTION WorkOS ids and local dev
#     authenticates against WorkOS STAGING, so the identity columns are
#     rewritten and then checked. See $WorkosOrgRelinks below for why the check
#     is the part that matters.
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
	[switch]$ResetElectric = $true,
	# Leave the cloned PROD WorkOS ids in place instead of relinking them. Real
	# WorkOS staging login will not find the agency; reach for DEV_IMPERSONATE_*.
	[switch]$SkipRelink,
	# How much operational history the local database keeps. Prod runs back to
	# 2011 - half a million inspections - and three years makes local dev just as
	# realistic against a database that syncs and re-snapshots far faster.
	[int]$YearsOfHistory = 3,
	# Keep every dated record. Reach for it when you are chasing something that
	# only reproduces against the full history.
	[switch]$AllHistory
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# WorkOS identity relink map
# ---------------------------------------------------------------------------
# The dump carries PRODUCTION WorkOS ids. Local dev authenticates against the
# WorkOS STAGING environment, and `resolveActiveLocalAuthIdentity` looks
# organizations up by `workos_organization_id`, so an unrelinked row is
# invisible to a staging session. `apps/admin` tolerates that (the operator
# grant is the session's WorkOS organization, not the local identity), but
# `apps/web` does not: `__root.tsx` throws when `localIdentity.organizationId`
# is null.
#
# Worse than invisible. Signing in against an org id that resolves to nothing
# provisions a *fresh* organization row, so the database ends up with two rows
# for the same agency. That is #82, and it happened on the Railway staging
# database when only Middlesex was in this map.
#
# So this is a table, not a pair of parameters, and every org that exists in
# both environments belongs in it. Add a row here rather than passing ids on the
# command line: an id passed by hand is one clone away from being forgotten.
$WorkosOrgRelinks = @(
	@{ Name = 'Middlesex'; Prod = 'org_01KRY8C6XHQ030P2NNDMY1PRSS'; Staging = 'org_01KRXZWNNE28Q00672CA1CKT70' }
	@{ Name = 'SIMMER'; Prod = 'org_01KRQEQBJJHF729PY0ED6P7875'; Staging = 'org_01KZC6NB6PPMV9GKYVHS4VJAQF' }
)
$WorkosUserRelinks = @(
	@{ Name = 'Middlesex owner'; Prod = 'user_01KRY8CW0K380JPC7FRW81WPB4'; Staging = 'user_01KQYXX9N212YZH59DXMH3Y6VV' }
)

if ([string]::IsNullOrWhiteSpace($ProdUrl)) {
	throw 'PROD_DATABASE_URL is not set. Provide the prod connection string (read-only role preferred).'
}
if (-not $AllHistory -and $YearsOfHistory -lt 1) {
	throw "-YearsOfHistory must be at least 1 (got $YearsOfHistory). Pass -AllHistory to keep everything."
}

$rowCountLibPath = Join-Path $PSScriptRoot 'lib/table-row-counts.ps1'
if (-not (Test-Path $rowCountLibPath)) { throw "Missing $rowCountLibPath, which the post-restore row-count check runs." }
. $rowCountLibPath

$pruneSqlPath = Join-Path $PSScriptRoot 'prune-history.sql'
if (-not $AllHistory -and -not (Test-Path $pruneSqlPath)) {
	throw "Missing $pruneSqlPath, which the history prune runs. Pass -AllHistory to skip pruning."
}

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

if (-not $AllHistory) {
	# Reference data - habitats, traps, addresses, contacts, routes, taxonomy,
	# products - is never pruned; only the dated records an agency performs. See
	# the header of prune-history.sql.
	$cutoff = (Get-Date).AddYears(-$YearsOfHistory).ToString('yyyy-MM-dd')
	Write-Host "==> Pruning dated records older than $cutoff (keeping $YearsOfHistory year(s))..." -ForegroundColor Cyan
	# The file has to be inside the container: psql runs there, and that is the
	# only place this script needs pg client tools.
	Invoke-Compose cp $pruneSqlPath 'postgres:/tmp/prune-history.sql'
	$pruneStart = Get-Date
	Invoke-Compose exec -T postgres psql "$LocalTarget" -X -v ON_ERROR_STOP=1 -v "cutoff=$cutoff" -f /tmp/prune-history.sql
	Invoke-Compose exec -T postgres sh -c 'rm -f /tmp/prune-history.sql'
	Write-Host "    Pruned in $([int]((Get-Date) - $pruneStart).TotalSeconds)s." -ForegroundColor DarkGray
}
else {
	Write-Host '==> -AllHistory set; the local database keeps every dated record prod has.' -ForegroundColor DarkGray
}

if (-not $SkipRelink) {
	Write-Host '==> Relinking cloned prod identities -> WorkOS STAGING (so you can log in normally)...' -ForegroundColor Cyan
	# Bulk data hangs off the internal org UUID, which the dump preserves, so only
	# these identity columns need rewriting.
	$relinkArgs = @("$LocalTarget", '-X', '-v', 'ON_ERROR_STOP=1')
	foreach ($map in $WorkosOrgRelinks) {
		Write-Host "    org  $($map.Name): $($map.Prod) -> $($map.Staging)" -ForegroundColor DarkGray
		$relinkArgs += @('-c', "update organizations set workos_organization_id = '$($map.Staging)', updated_at = now() where workos_organization_id = '$($map.Prod)';")
	}
	foreach ($map in $WorkosUserRelinks) {
		Write-Host "    user $($map.Name): $($map.Prod) -> $($map.Staging)" -ForegroundColor DarkGray
		$relinkArgs += @('-c', "update users set workos_user_id = '$($map.Staging)', updated_at = now() where workos_user_id = '$($map.Prod)';")
		$relinkArgs += @('-c', "update memberships set is_default = true, updated_at = now() where user_id = (select id from users where workos_user_id = '$($map.Staging)');")
	}
	Invoke-Compose exec -T postgres psql @relinkArgs

	# The guard that makes the relink self-checking. A prod id still present after
	# the rewrite means either an org is missing from $WorkosOrgRelinks or its id
	# changed, and both fail the same silent way: the next login provisions a
	# duplicate organization instead of finding this one. Failing here is the
	# point - a relink whose only verification is someone noticing a broken
	# workspace is the state #82 described.
	Write-Host '==> Verifying no organization still carries a prod WorkOS id...' -ForegroundColor Cyan
	$prodOrgList = ($WorkosOrgRelinks | ForEach-Object { "'$($_.Prod)'" }) -join ','
	$stagingOrgList = ($WorkosOrgRelinks | ForEach-Object { "'$($_.Staging)'" }) -join ','
	# `organizations_workos_organization_id_key` is unique, so a relink that would
	# collide with an existing row aborts the UPDATE above rather than reaching
	# here. Both failures are loud, which is the only property that matters.
	$stragglers = (& docker compose exec -T postgres psql "$LocalTarget" -X -A -t -v ON_ERROR_STOP=1 `
		-c "select count(*) from organizations where workos_organization_id in ($prodOrgList);").Trim()
	if ($LASTEXITCODE -ne 0) { throw "relink verification query failed (exit $LASTEXITCODE)" }
	if ($stragglers -ne '0') {
		throw "$stragglers organization row(s) still carry a PROD WorkOS id after relinking. Add them to `$WorkosOrgRelinks in this script."
	}

	# Not fatal, but worth saying: an org outside the map is one a staging login
	# cannot find, and the symptom is a duplicate row rather than an error.
	Invoke-Compose exec -T postgres psql "$LocalTarget" -X -v ON_ERROR_STOP=1 `
		-c "select name, workos_organization_id as unmapped_workos_org_id from organizations where workos_organization_id not in ($stagingOrgList);"

	if ($env:DEV_IMPERSONATE_WORKOS_USER_ID -or $env:DEV_IMPERSONATE_WORKOS_ORG_ID) {
		Write-Host '    WARNING: DEV_IMPERSONATE_* is set in your shell env; it overrides real login. Comment it out in .env to use WorkOS staging auth.' -ForegroundColor Yellow
	}
}
else {
	Write-Host '==> -SkipRelink set; leaving cloned PROD WorkOS ids in place (real staging login will spawn a fresh empty org; use DEV_IMPERSONATE_* or relink manually).' -ForegroundColor DarkGray
}

if ($ResetElectric) {
	Write-Host '==> Resetting Electric storage (clears stale shape log for the recreated DB)...' -ForegroundColor Cyan
	# Clear the named electric-data volume contents without removing postgres-data.
	Invoke-Compose run --rm --no-deps --entrypoint sh electric -c 'rm -rf /var/lib/electric/* /var/lib/electric/.* 2>/dev/null || true'
	Write-Host '==> Starting Electric...' -ForegroundColor Cyan
	Invoke-Compose up -d electric
}

Write-Host ''
Write-Host 'Done. Local DB now mirrors prod.' -ForegroundColor Green
Write-Host @'

NEXT:
  1. pnpm db:migrate, so the clone carries any migration prod has not had yet.
  2. Start the stack (pnpm dev) and sign in at https://localhost:5175 with your
     WorkOS STAGING credentials. The identity was relinked above, so the agency
     resolves; DEV_IMPERSONATE_* must stay commented out in .env.
'@ -ForegroundColor DarkGray
