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
	[switch]$Yes,
	# WorkOS identity relink (runs after the clone): the cloned data carries PROD
	# WorkOS ids, but local dev authenticates against the WorkOS STAGING environment.
	# These map the prod org/user the dump brings over to the staging org/user you
	# actually log in as, so `pnpm dev` + a normal WorkOS staging login lands you in
	# the cloned org. Defaults match the current Middlesex owner setup; override to
	# relink a different identity, or pass -SkipRelink to leave prod ids in place.
	[string]$ProdWorkosOrgId = 'org_01KRY8C6XHQ030P2NNDMY1PRSS',
	[string]$StagingWorkosOrgId = 'org_01KRXZWNNE28Q00672CA1CKT70',
	[string]$ProdWorkosUserId = 'user_01KRY8CW0K380JPC7FRW81WPB4',
	[string]$StagingWorkosUserId = 'user_01KQYXX9N212YZH59DXMH3Y6VV',
	[switch]$SkipRelink
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

	if (-not $SkipRelink) {
		Write-Host '==> Relinking cloned prod identity -> WorkOS STAGING (so you can log in normally) ...' -ForegroundColor Cyan
		# Rewrite the org + owner user WorkOS ids from prod to staging, then flag that
		# membership as the user's default org. Bulk data hangs off the internal org
		# UUID (preserved by the dump), so only these identity rows need touching.
		& $psql $StagingUrl -v ON_ERROR_STOP=1 `
			-v prod_org=$ProdWorkosOrgId -v staging_org=$StagingWorkosOrgId `
			-v prod_user=$ProdWorkosUserId -v staging_user=$StagingWorkosUserId `
			-c "update organizations set workos_organization_id = :'staging_org', updated_at = now() where workos_organization_id = :'prod_org';" `
			-c "update users set workos_user_id = :'staging_user', updated_at = now() where workos_user_id = :'prod_user';" `
			-c "update memberships set is_default = true, updated_at = now() where user_id = (select id from users where workos_user_id = :'staging_user') and organization_id = (select id from organizations where workos_organization_id = :'staging_org');" `
			-c "select o.name, o.workos_organization_id, u.email, u.workos_user_id, m.role, m.status, m.is_default from memberships m join organizations o on o.id = m.organization_id join users u on u.id = m.user_id where u.workos_user_id = :'staging_user' and o.workos_organization_id = :'staging_org';"
		if ($LASTEXITCODE -ne 0) { throw "WorkOS staging relink failed (exit $LASTEXITCODE)" }
		if ($env:DEV_IMPERSONATE_WORKOS_USER_ID -or $env:DEV_IMPERSONATE_WORKOS_ORG_ID) {
			Write-Host '    WARNING: DEV_IMPERSONATE_* is set in your shell env - it overrides real login. Comment it out in .env to use WorkOS staging auth.' -ForegroundColor Yellow
		}
	}
	else {
		Write-Host '==> -SkipRelink set; leaving cloned PROD WorkOS ids in place (real staging login will spawn a fresh empty org; use DEV_IMPERSONATE_* or relink manually).' -ForegroundColor DarkGray
	}
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
     at staging, and WORKOS_* at the staging environment. Start the local server +
     web and log in normally at https://localhost:5173 (the identity was relinked to
     the WorkOS staging org/user above). Ensure DEV_IMPERSONATE_* stays commented out.
'@ -ForegroundColor DarkGray
