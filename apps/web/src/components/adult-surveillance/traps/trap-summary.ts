import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { TRAP_STATUS_LABELS } from './legend';
import type { TrapFilters } from './traps-search';

/**
 * The two groupings the Traps summary draws, out of the counts
 * `/map/traps/summary` answers, each value wired to the filter it names.
 *
 * A collection method is added to `methods`, and Active and Inactive set
 * `status`. A value the filter already holds is selected, and clicking it
 * widens back out: the method leaves the set, `status` goes to `all`. Method
 * names come from the catalog the chips read, since the server answers ids.
 */
export function trapSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: TrapFilters;
	readonly setFilters: (patch: Partial<TrapFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	const counts = (grouping: string) => summary.groups[grouping] ?? [];

	// Every trap carries a method, so a null value is never answered.
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

	// In the order the Status control lists them rather than by count, so Active
	// sits in the same place whichever side holds more.
	const statuses: SummaryGroup[] = (['active', 'inactive'] as const).map((status) => {
		const isSelected = filters.status === status;
		return {
			key: status,
			label: TRAP_STATUS_LABELS[status],
			count: counts('isActive').find((group) => group.value === (status === 'active'))?.count ?? 0,
			isSelected,
			onToggle: () => setFilters({ status: isSelected ? 'all' : status }),
		};
	});

	return [
		{ key: 'method', title: 'Collection Method', groups: methods },
		{ key: 'status', title: 'Status', groups: statuses.filter(hasRecords) },
	];
}

/** A side no trap in view is on is not drawn, because clicking it would empty the panel. */
function hasRecords(group: SummaryGroup): boolean {
	return group.count > 0;
}
