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
#   ./scripts/clone-prod-to-staging.ps1 -YearsOfHistory 5   # keep more
#   ./scripts/clone-prod-to-staging.ps1 -AllHistory         # keep everything
#
# The clone checks that the data arrived. Every ordinary table in `public` is
# counted on prod and on staging, and staging holding fewer rows than prod fails
# the run. Three things about that check are worth knowing before you change it:
#
#   - It runs after the restore and BEFORE the prune. The prune deletes dated
#     records on purpose, so after it every dated table is legitimately short and
#     a comparison says nothing.
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
#
# Staging keeps the last 3 years of DATED records by default (inspections,
# applications, collections, service requests, …) and all reference data
# (habitats, traps, addresses, contacts, routes, taxonomy). The dump is still
# whole — prod is only ever read — and the trim happens on the target afterwards;
# see scripts/prune-staging-history.sql.

[CmdletBinding()]
param(
	[string]$ProdUrl = $env:PROD_DATABASE_URL,
	[string]$StagingUrl = $env:STAGING_DATABASE_URL,
	[string]$PgBin,
	# Skip the interactive "did you stop staging Electric?" pre-flight confirmation.
	[switch]$Yes,
	# Leave the cloned PROD WorkOS ids in place instead of relinking them.
	[switch]$SkipRelink,
	# How much operational history staging keeps. Prod runs back to 2011 — half a
	# million inspections — and three years makes local dev just as realistic
	# against a database that syncs and re-snapshots in a fraction of the time.
	[int]$YearsOfHistory = 3,
	# Keep every dated record, as this script did before. Reach for it when you
	# are chasing something that only reproduces against the full history.
	[switch]$AllHistory
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# WorkOS identity relink map
# ---------------------------------------------------------------------------
# The dump carries PRODUCTION WorkOS ids. Local dev authenticates against the
# WorkOS STAGING environment, and `resolveActiveLocalAuthIdentity` looks
# organizations up by `workos_organization_id` — so an unrelinked row is
# invisible to a staging session. `apps/admin` tolerates that (the operator
# grant is the session's WorkOS organization, not the local identity), but `apps/web`
# does not: `__root.tsx` throws when `localIdentity.organizationId` is null.
#
# Worse than invisible, actually. Signing in against an org id that resolves to
# nothing gets a *fresh* organization row provisioned, so staging ends up with
# two rows for the same agency — which is what happened to SIMMER (#82) while
# only Middlesex was in this map.
#
# So this is a table, not a pair of parameters, and every org that exists in
# both environments belongs in it. Add a row here rather than passing ids on the
# command line: an id passed by hand is one clone away from being forgotten
# again, which is the whole failure this issue was about.
$WorkosOrgRelinks = @(
	@{ Name = 'Middlesex'; Prod = 'org_01KRY8C6XHQ030P2NNDMY1PRSS'; Staging = 'org_01KRXZWNNE28Q00672CA1CKT70' }
	@{ Name = 'SIMMER'; Prod = 'org_01KRQEQBJJHF729PY0ED6P7875'; Staging = 'org_01KZC6NB6PPMV9GKYVHS4VJAQF' }
)
$WorkosUserRelinks = @(
	@{ Name = 'Middlesex owner'; Prod = 'user_01KRY8CW0K380JPC7FRW81WPB4'; Staging = 'user_01KQYXX9N212YZH59DXMH3Y6VV' }
)

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
if (-not $AllHistory -and $YearsOfHistory -lt 1) {
	throw "-YearsOfHistory must be at least 1 (got $YearsOfHistory). Pass -AllHistory to keep everything."
}

$rowCountLibPath = Join-Path $PSScriptRoot 'lib/table-row-counts.ps1'
if (-not (Test-Path $rowCountLibPath)) { throw "Missing $rowCountLibPath, which the post-restore row-count check runs." }
. $rowCountLibPath

$pruneSqlPath = Join-Path $PSScriptRoot 'prune-staging-history.sql'
if (-not $AllHistory -and -not (Test-Path $pruneSqlPath)) {
	throw "Missing $pruneSqlPath, which the history prune runs. Pass -AllHistory to skip pruning."
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
if ($AllHistory) {
	Write-Host '    History:            ALL (-AllHistory)' -ForegroundColor DarkGray
}
else {
	Write-Host "    History:            last $YearsOfHistory year(s) of dated records" -ForegroundColor DarkGray
}
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

	Write-Host '==> Verifying every table arrived (before the prune trims the dated ones) ...' -ForegroundColor Cyan
	$stagingOutput = & $psql $StagingUrl -X -A -t -F '|' -v ON_ERROR_STOP=1 -c $PublicTableRowCountSql
	if ($LASTEXITCODE -ne 0) { throw "staging row-count query failed (exit $LASTEXITCODE)" }
	$stagingCounts = ConvertTo-TableRowCountMap -PsqlOutput $stagingOutput
	# Failing here leaves staging loaded but neither pruned nor relinked, so the
	# advice has to say so: signing in against unrelinked prod WorkOS ids
	# provisions a duplicate organization, which is #82.
	Assert-NoTableRowCountShortfall -SourceCounts $prodCounts -TargetCounts $stagingCounts `
		-SourceLabel 'prod' -TargetLabel 'staging' `
		-FailureAdvice 'Staging is loaded but NOT pruned and NOT relinked; do not sign in against it. Read the pg_restore output above for the failing table and re-run the clone.'

	if (-not $AllHistory) {
		# Reference data an agency accumulates — habitats, traps, addresses,
		# contacts, routes, taxonomy, products — is never pruned; only the dated
		# records it performs. See the header of prune-staging-history.sql.
		$cutoff = (Get-Date).AddYears(-$YearsOfHistory).ToString('yyyy-MM-dd')
		Write-Host "==> Pruning dated records older than $cutoff (keeping $YearsOfHistory year(s)) ..." -ForegroundColor Cyan
		Write-Host '    Around half a million rows; roughly 30 seconds.' -ForegroundColor DarkGray
		& $psql $StagingUrl -X -v ON_ERROR_STOP=1 -v "cutoff=$cutoff" -f $pruneSqlPath
		if ($LASTEXITCODE -ne 0) { throw "history prune failed (exit $LASTEXITCODE)" }
	}
	else {
		Write-Host '==> -AllHistory set; staging keeps every dated record prod has.' -ForegroundColor DarkGray
	}

	if (-not $SkipRelink) {
		Write-Host '==> Relinking cloned prod identities -> WorkOS STAGING (so you can log in normally) ...' -ForegroundColor Cyan
		# Bulk data hangs off the internal org UUID, which the dump preserves, so
		# only these identity columns need rewriting.
		$relinkSql = New-Object System.Collections.Generic.List[string]
		foreach ($map in $WorkosOrgRelinks) {
			Write-Host "    org  $($map.Name): $($map.Prod) -> $($map.Staging)" -ForegroundColor DarkGray
			$relinkSql.Add("update organizations set workos_organization_id = '$($map.Staging)', updated_at = now() where workos_organization_id = '$($map.Prod)';")
		}
		foreach ($map in $WorkosUserRelinks) {
			Write-Host "    user $($map.Name): $($map.Prod) -> $($map.Staging)" -ForegroundColor DarkGray
			$relinkSql.Add("update users set workos_user_id = '$($map.Staging)', updated_at = now() where workos_user_id = '$($map.Prod)';")
			$relinkSql.Add("update memberships set is_default = true, updated_at = now() where user_id = (select id from users where workos_user_id = '$($map.Staging)');")
		}

		$relinkArgs = @($StagingUrl, '-v', 'ON_ERROR_STOP=1')
		foreach ($statement in $relinkSql) { $relinkArgs += @('-c', $statement) }
		& $psql @relinkArgs
		if ($LASTEXITCODE -ne 0) { throw "WorkOS staging relink failed (exit $LASTEXITCODE)" }

		# The guard that makes the relink self-checking. A prod id still present
		# after the rewrite means either an org is missing from $WorkosOrgRelinks
		# or its id changed, and both fail the same silent way: the next staging
		# login provisions a duplicate organization instead of finding this one.
		# Failing here is the whole point — a relink that is only ever verified by
		# someone noticing a broken workspace is the state #82 described.
		Write-Host '==> Verifying no organization still carries a prod WorkOS id ...' -ForegroundColor Cyan
		$prodOrgList = ($WorkosOrgRelinks | ForEach-Object { "'$($_.Prod)'" }) -join ','
		$stagingOrgList = ($WorkosOrgRelinks | ForEach-Object { "'$($_.Staging)'" }) -join ','
		# `organizations_workos_organization_id_key` is unique, so a relink that
		# would collide with an existing staging row aborts the UPDATE above
		# rather than reaching here. Both failures are loud, which is the only
		# property that matters.
		$stragglers = (& $psql $StagingUrl -X -A -t -v ON_ERROR_STOP=1 `
			-c "select count(*) from organizations where workos_organization_id in ($prodOrgList);").Trim()
		if ($LASTEXITCODE -ne 0) { throw "relink verification query failed (exit $LASTEXITCODE)" }
		if ($stragglers -ne '0') {
			throw "$stragglers organization row(s) still carry a PROD WorkOS id after relinking. Add them to `$WorkosOrgRelinks in this script."
		}

		# Not fatal, but worth saying: an org outside the map is one a staging
		# login cannot find, and the symptom is a duplicate row rather than an
		# error.
		& $psql $StagingUrl -X -v ON_ERROR_STOP=1 `
			-c "select name, workos_organization_id as unmapped_workos_org_id from organizations where workos_organization_id not in ($stagingOrgList);"

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
