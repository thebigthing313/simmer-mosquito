#!/usr/bin/env pwsh
# Per-table row-count comparison for the two clone scripts. Dot-source it:
#
#   . (Join-Path $PSScriptRoot 'lib/table-row-counts.ps1')
#
# A clone that restores half a table leaves a database that works, serves pages
# and answers queries, and is wrong only in ways you find by counting. Issue
# #310 spent four days on a gap that turned out to be the clone date, and the
# reason it took four days is that nothing in the clone had ever counted a row.
# pg_restore's exit code cannot answer it either: PostGIS and extension comments
# make it non-zero on every run, so both scripts ignore it. This is what
# replaces it.

# Exact counts for every ordinary table in `public`, in one query. query_to_xml
# runs the count per table server-side, so the table list never has to make a
# round trip to be turned into a UNION ALL. Views, sequences and partitioned
# parents are out (relkind 'r'), the first two because they hold no rows of
# their own and the last because its partitions are counted individually.
$PublicTableRowCountSql = @'
select c.relname,
       (xpath(
         '/row/c/text()',
         query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')
       ))[1]::text::bigint
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
'@

# Tables allowed to come back short, with the reason each is here. Every entry
# is a table the check stops covering, so the list stays this short: a name goes
# in only once someone has read the restore output and understands why that
# table differs on a healthy run.
$PublicTableRowCountExemptions = @{
	'spatial_ref_sys' = 'PostGIS projection definitions. `create extension postgis` writes them and the dump carries them again as extension config data, so the restore collides with itself there. It holds no organization data whatever the count comes to.'
}

# Turn `name|count` lines from `psql -A -t -F '|'` into a name -> count map.
function ConvertTo-TableRowCountMap {
	param([string[]]$PsqlOutput)

	$counts = @{}
	foreach ($line in $PsqlOutput) {
		if ([string]::IsNullOrWhiteSpace($line)) { continue }
		$parts = $line.Split('|')
		if ($parts.Count -ne 2) { throw "Unreadable row-count line from psql: '$line'" }
		$counts[$parts[0].Trim()] = [long]$parts[1].Trim()
	}
	if ($counts.Count -eq 0) { throw 'The row-count query returned no tables, which means it did not run against a restored schema.' }
	return $counts
}

# Compare the target against the source and throw if the target is short.
#
# Only a shortfall fails. A surplus is expected and says nothing: the source
# baseline is read before the dump, so a row written to the source while the
# dump runs reaches the target without ever reaching the baseline. Reading the
# baseline first is what makes that drift safe in the one direction, because the
# same row read afterwards would look like a missing row on the target.
function Assert-NoTableRowCountShortfall {
	param(
		[hashtable]$SourceCounts,
		[hashtable]$TargetCounts,
		[string]$SourceLabel,
		[string]$TargetLabel,
		[string]$FailureAdvice
	)

	$short = New-Object System.Collections.Generic.List[string]
	$allowed = New-Object System.Collections.Generic.List[string]

	foreach ($table in ($SourceCounts.Keys | Sort-Object)) {
		$sourceCount = $SourceCounts[$table]
		$targetCount = if ($TargetCounts.ContainsKey($table)) { $TargetCounts[$table] } else { -1 }
		if ($targetCount -ge $sourceCount) { continue }

		$state = if ($targetCount -lt 0) { 'table not restored at all' } else { "$targetCount of $sourceCount rows, short by $($sourceCount - $targetCount)" }
		if ($PublicTableRowCountExemptions.ContainsKey($table)) {
			$allowed.Add("$table ($state)")
			continue
		}
		$short.Add("$table ($state)")
	}

	Write-Host "    $($SourceCounts.Count) tables in $SourceLabel; $($TargetCounts.Count) in $TargetLabel." -ForegroundColor DarkGray
	foreach ($entry in $allowed) {
		Write-Host "    allowed to differ: $entry" -ForegroundColor DarkGray
	}
	if ($short.Count -eq 0) {
		Write-Host "    Every table the check covers holds in $TargetLabel at least what it held in $SourceLabel." -ForegroundColor DarkGray
		return
	}

	foreach ($entry in $short) {
		Write-Host "    SHORT: $entry" -ForegroundColor Red
	}
	throw "The restore is incomplete: $($short.Count) table(s) short. $FailureAdvice"
}
