import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import type { HabitatFilters } from './habitats-search';

/**
 * The four groupings the Habitats summary draws, out of the counts
 * `/map/habitats/summary` answers, each value wired to the filter it names.
 *
 * A type is added to `typeIds`, Active and Inactive set `status`, Accessible
 * and Inaccessible set `access`, and Untreated sets `untreated`. A value the
 * filter already holds is selected, and clicking it widens back out: the type
 * leaves the set, `status` and `access` go to `all`, `untreated` goes off.
 * Type names come from the catalog the chips read, since the server answers
 * ids. A habitat with no type is counted and drawn as text, because no filter
 * selects it.
 */
export function habitatSummaryGroupings({
	summary,
	filters,
	setFilters,
	typeNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: HabitatFilters;
	readonly setFilters: (patch: Partial<HabitatFilters>) => void;
	readonly typeNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	const counts = (grouping: string) => summary.groups[grouping] ?? [];
	const countOf = (grouping: string, value: boolean) =>
		counts(grouping).find((group) => group.value === value)?.count ?? 0;

	const types: SummaryGroup[] = counts('habitatTypeId').map(({ value, count }) =>
		typeof value === 'string'
			? {
					key: value,
					label: typeNameById.get(value) ?? 'Unknown type',
					count,
					isSelected: filters.typeIds.has(value),
					onToggle: () => setFilters({ typeIds: toggle(filters.typeIds, value) }),
				}
			: { key: 'none', label: 'No type', count },
	);

	// Each side of a yes-or-no grouping sets its filter to that side, and the
	// side already set goes back to `all`. Drawn in a fixed order rather than by
	// count, so Active sits in the same place whichever side holds more.
	const sides = <TSide extends string>(
		grouping: string,
		current: TSide | 'all',
		apply: (next: TSide | 'all') => void,
		pair: readonly (readonly [side: TSide, label: string, value: boolean])[],
	): SummaryGroup[] =>
		pair.map(([side, label, value]) => {
			const isSelected = current === side;
			return {
				key: side,
				label,
				count: countOf(grouping, value),
				isSelected,
				onToggle: () => apply(isSelected ? 'all' : side),
			};
		});

	const status = sides('isActive', filters.status, (next) => setFilters({ status: next }), [
		['active', 'Active', true],
		['inactive', 'Inactive', false],
	]);
	const access = sides('isInaccessible', filters.access, (next) => setFilters({ access: next }), [
		['accessible', 'Accessible', false],
		['inaccessible', 'Inaccessible', true],
	]);

	// Only the untreated side is drawn, since no filter selects its opposite.
	const untreated = {
		key: 'untreated',
		label: 'Untreated',
		count: countOf('untreated', true),
		isSelected: filters.untreated,
		onToggle: () => setFilters({ untreated: !filters.untreated }),
	};

	return [
		{ key: 'type', title: 'Habitat Type', groups: types },
		{ key: 'status', title: 'Status', groups: status.filter(hasRecords) },
		{ key: 'access', title: 'Access', groups: access.filter(hasRecords) },
		{ key: 'treatment', title: 'Treatment', groups: [untreated].filter(hasRecords) },
	];
}

/** A side no habitat in view is on is not drawn, because clicking it would empty the panel. */
function hasRecords(group: SummaryGroup): boolean {
	return group.count > 0;
}
