#!/usr/bin/env pwsh
# Refresh the Railway staging sandbox from production. This is the whole job,
# and it is run on demand, not on a schedule.
#
#   1. The schema gate. Prod and staging must already hold the same schema and
#      the same applied migrations, which is only true just after a promotion.
#      Read-only on both sides; nothing is touched if this refuses.
#   2. The clone. scripts/clone-prod-to-staging.ps1, prod's whole history.
#   3. The migrations. `dbmate up` against staging, so anything the reload
#      rolled back comes back.
#
# Why the gate exists. Staging holds migrations prod has not seen, by design,
# because that is what a soak is. A dump carries prod's `schema_migrations`
# along with prod's schema, so a clone taken mid-soak erases every unshipped
# migration and leaves the deployed staging branch running against a schema
# behind it. Nothing about that failure is loud on its own — the app just starts
# answering wrong — so the refusal has to come before the wipe.
#
# Why the checkout has to be on `staging`. Step 3 applies the migration set of
# whatever branch you are standing on. From `develop` that would push staging's
# database ahead of the code deployed on it, silently. So the run refuses unless
# HEAD is `origin/staging`, which is what the staging services are running.
#
# LEAVE STAGING'S ELECTRIC RUNNING throughout. Staging caps
# `max_slot_wal_keep_size` at 2048MB and the restore writes about a gigabyte of
# WAL; a stopped Electric stops advancing its slot, the WAL piles up behind it,
# and Postgres invalidates the slot. See the clone script's header, and #371.
#
# Usage (PowerShell, from repo root, on the `staging` branch):
#   $env:PROD_DATABASE_URL    = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'   # prod public proxy
#   $env:STAGING_DATABASE_URL = 'postgres://USER:PASS@HOST:PORT/DB?sslmode=disable'   # staging public proxy
#   ./scripts/refresh-staging.ps1
#
# Every step fails loudly and stops. A failure between the wipe and the end
# leaves staging holding a partial reload, which is not a state to leave the
# sandbox in: re-run the refresh rather than reasoning about what survived.

[CmdletBinding()]
param(
	[string]$ProdUrl = $env:PROD_DATABASE_URL,
	[string]$StagingUrl = $env:STAGING_DATABASE_URL,
	[string]$PgBin,
	# Skip the interactive "this wipes staging" confirmation.
	[switch]$Yes
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$pnpm = if ($IsWindows) { 'pnpm.cmd' } else { 'pnpm' }

if ([string]::IsNullOrWhiteSpace($ProdUrl)) {
	throw 'PROD_DATABASE_URL is not set. Provide the prod PUBLIC proxy connection string (read-only role preferred).'
}
if ([string]::IsNullOrWhiteSpace($StagingUrl)) {
	throw 'STAGING_DATABASE_URL is not set. Provide the staging PUBLIC proxy connection string.'
}
if ($ProdUrl -eq $StagingUrl) {
	throw 'PROD_DATABASE_URL and STAGING_DATABASE_URL are identical. Refusing to wipe prod.'
}

Write-Host '==> Checking the checkout is what staging is running ...' -ForegroundColor Cyan
# `dbmate up` in step 3 applies this checkout's migrations. Standing anywhere
# but on the deployed staging commit makes that a silent schema change.
& git -C $repoRoot fetch origin staging --quiet
if ($LASTEXITCODE -ne 0) { throw "git fetch origin staging failed (exit $LASTEXITCODE)" }
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
$stagingHead = (& git -C $repoRoot rev-parse origin/staging).Trim()
if ($head -ne $stagingHead) {
	throw "HEAD is $head and origin/staging is $stagingHead. Run this from a checkout of the staging branch: step 3 applies this checkout's migrations to the staging database."
}

Write-Host '==> Gate: do prod and staging already hold the same schema? ...' -ForegroundColor Cyan
Write-Host '    Read-only on both sides. A refusal here touches nothing.' -ForegroundColor DarkGray
& node (Join-Path $PSScriptRoot 'check-schema-drift.mjs') --observed $StagingUrl --expected $ProdUrl --pairwise
if ($LASTEXITCODE -ne 0) {
	throw @'
Prod and staging do not hold the same schema, so a clone would erase what is soaking on staging. The named migrations and objects are above.

A refresh is only safe just after a promotion, when main has shipped everything staging holds. Promote first, then re-run this.
'@
}

if (-not $Yes) {
	Write-Host ''
	Write-Host '    The gate passed. The next step WIPES the staging database and reloads it from prod.' -ForegroundColor Yellow
	Write-Host '    Type "yes" to go ahead.' -ForegroundColor Yellow
	if ((Read-Host 'Proceed?') -ne 'yes') { throw 'Aborted by user.' }
}

$cloneArgs = @{ ProdUrl = $ProdUrl; StagingUrl = $StagingUrl; Yes = $true }
if (-not [string]::IsNullOrWhiteSpace($PgBin)) { $cloneArgs.PgBin = $PgBin }
& (Join-Path $PSScriptRoot 'clone-prod-to-staging.ps1') @cloneArgs

Write-Host '==> Applying migrations to staging (a no-op when the gate found nothing soaking) ...' -ForegroundColor Cyan
Push-Location $repoRoot
try {
	& $pnpm exec dbmate `
		--url $StagingUrl `
		--migrations-dir packages/db/migrations `
		--schema-file packages/db/schema.sql `
		--no-dump-schema `
		--wait `
		up
	if ($LASTEXITCODE -ne 0) { throw "dbmate up against staging failed (exit $LASTEXITCODE)" }
}
finally {
	Pop-Location
}

Write-Host ''
Write-Host 'Done. Staging now mirrors prod, with the staging branch migrations applied.' -ForegroundColor Green
Write-Host @'

NEXT:
  1. Redeploy the staging Electric service once. Its stored shape state predates
     the reload, so it needs a clean re-snapshot before the sandbox reads right.
  2. Sign in to staging as a production identity and check the agency you land
     in is the one that identity belongs to. The reload replaces `users` and
     `organizations` wholesale with production rows, so a row still carrying a
     WorkOS staging id afterwards is a row the clone did not reach.
'@ -ForegroundColor DarkGray
