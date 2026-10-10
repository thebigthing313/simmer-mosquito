import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { collectionFilterDeclarations } from './collection-filters';
import type { CollectionFilters } from './collections-search';
import { collectionStatusLabel } from './legend';

/**
 * The Collections summary's three groupings and its two figures, out of what
 * `/map/collections/summary` answers.
 *
 * Problems, Identification and Collection Method are the declared filters'
 * toggle groups. The zero results and the collected are drawn as text,
 * because no filter selects them.
 */
export function collectionSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: CollectionFilters;
	readonly setFilters: (patch: Partial<CollectionFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	// A figure at zero is still drawn, unlike a flag: it is text, so there is no
	// click that would empty the panel, and "Zero result 0" is an answer.
	const figures = summary.figures ?? {};
	const statuses: SummaryGroup[] = (
		[
			['zero_result', figures.zeroResult],
			['collected', figures.collected],
		] as const
	).flatMap(([status, count]) =>
		count === undefined ? [] : [{ key: status, label: collectionStatusLabel(status), count }],
	);

	return [
		...declaredSummaryGroupings(collectionFilterDeclarations, ['problems', 'awaiting', 'methods'], {
			summary,
			filters,
			setFilters,
			names: { methods: methodNameById },
		}),
		{ key: 'status', title: 'Status', groups: statuses },
	];
}
