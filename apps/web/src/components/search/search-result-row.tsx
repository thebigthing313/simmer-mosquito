import type { SearchResult } from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { CommandItem } from '@simmer-mosquito/ui-web/components/ui/command';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { searchResultIcon } from './search-destinations';

/**
 * One palette row: two lines under one leading icon, and **no type badge**.
 *
 * The group heading already says what kind these are, so a badge would repeat it
 * once per row. The second line is whatever the server composed — the matched
 * field's text where the title does not already explain the hit, the record's
 * context line otherwise — so the per-table rules for filling it live in one
 * place rather than being split across the wire.
 */
export function SearchResultRow({
	dimmed,
	onSelect,
	result,
	value,
}: {
	readonly dimmed: boolean;
	readonly onSelect: () => void;
	readonly result: SearchResult;
	readonly value: string;
}) {
	const Icon = searchResultIcon(result);

	return (
		<CommandItem
			className={cn('items-start gap-3 py-2', dimmed && 'opacity-50')}
			onSelect={onSelect}
			value={value}
		>
			<Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<span className="flex min-w-0 flex-col">
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate text-sm text-foreground">{result.title}</span>
					<RetiredMarker result={result} />
				</span>
				{result.subtitle === undefined ? null : (
					<span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>
				)}
			</span>
		</CommandItem>
	);
}

/**
 * The marker on a retired record, shown by both result surfaces.
 *
 * Only the three corpus tables with a lifecycle can carry the flag, so this
 * renders nothing for every other result rather than reading a false. A retired
 * record is still indexed and still returned in rank order; this is the only
 * thing that changes about it.
 */
export function RetiredMarker({ result }: { readonly result: SearchResult }) {
	if (result.kind !== 'record' || result.retired !== true) {
		return null;
	}

	return (
		<Badge className="shrink-0" tone="neutral" variant="outline">
			Retired
		</Badge>
	);
}
