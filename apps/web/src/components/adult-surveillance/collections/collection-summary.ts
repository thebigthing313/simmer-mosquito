import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import type { CollectionFilters } from './collections-search';
import { collectionStatusLabel } from './legend';

/**
 * The Collections summary's three groupings and its two figures, out of what
 * `/map/collections/summary` answers, each value wired to the filter it names.
 *
 * Problem reported sets `problems`, Awaiting identification sets `awaiting`,
 * and a collection method is added to `methods`. A value the filter already
 * holds is selected, and clicking it widens back out: the flag goes off, the
 * method leaves the set. Method names come from the catalog the chips read,
 * since the server answers ids. The zero results and the collected are drawn
 * as text, because no filter selects them.
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
	const counts = (grouping: string) => summary.groups[grouping] ?? [];
	const flagged = (grouping: string) =>
		counts(grouping).find((group) => group.value === true)?.count ?? 0;

	// Only the flagged side of each is drawn, since no filter selects its opposite.
	const problem = {
		key: 'problem',
		label: 'Problem reported',
		count: flagged('problem'),
		isSelected: filters.problems,
		onToggle: () => setFilters({ problems: !filters.problems }),
	};
	const awaiting = {
		key: 'awaiting',
		label: 'Awaiting identification',
		count: flagged('awaiting'),
		isSelected: filters.awaiting,
		onToggle: () => setFilters({ awaiting: !filters.awaiting }),
	};

	// Every collection carries a method, so a null value is never answered.
	const methods: SummaryGroup[] = counts('collectionMethodId').flatMap(({ value, count }) =>
		typeof value === 'string'
			? [
					{
						key: value,
						label: methodNameById.get(value) ?? 'Unknown method',
						count,
						isSelected: filters.methods.has(value),
						onToggle: () => setFilters({ methods: toggle(filters.methods, value) }),
					},
				]
			: [],
	);

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
		{ key: 'problem', title: 'Problems', groups: [problem].filter(hasRecords) },
		{ key: 'awaiting', title: 'Identification', groups: [awaiting].filter(hasRecords) },
		{ key: 'method', title: 'Collection Method', groups: methods },
		{ key: 'status', title: 'Status', groups: statuses },
	];
}

/** A flag no collection in view carries is not drawn, because clicking it would empty the panel. */
function hasRecords(group: SummaryGroup): boolean {
	return group.count > 0;
}
