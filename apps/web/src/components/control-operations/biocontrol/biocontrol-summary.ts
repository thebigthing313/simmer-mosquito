import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { formatAmount } from '../control-display';
import type { BiocontrolFilters } from './biocontrol-actions-search';

/** A filter on the Biocontrol Actions page that takes a set of ids. */
type IdSetFilter = 'methods' | 'people';

/**
 * The Biocontrol Actions summary's three groupings and its amount released,
 * out of what `/map/biocontrol/summary` answers, each value wired to the
 * filter it names.
 *
 * A method is added to `methods`, a technician to `people`, and Linked to a
 * Habitat sets `habitat`. A value the filter already holds is selected, and
 * clicking it widens back out: the id leaves the set, the flag goes off. Names
 * come from the catalogs the chips read, since the server answers ids. The
 * amount released is drawn as text, one line per unit.
 */
export function biocontrolSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
	personNameById,
	unitById,
}: {
	readonly summary: MapSummary;
	readonly filters: BiocontrolFilters;
	readonly setFilters: (patch: Partial<BiocontrolFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<
		string,
		{ readonly unitName: string; readonly abbreviation: string }
	>;
}): readonly SummaryGrouping[] {
	// A biocontrol action with no technician has no filter value to set, so its
	// null group is not drawn.
	const idGroups = (
		grouping: string,
		filter: IdSetFilter,
		nameById: ReadonlyMap<string, string>,
		unknown: string,
	): SummaryGroup[] =>
		(summary.groups[grouping] ?? []).flatMap(({ value, count }) =>
			typeof value === 'string'
				? [
						{
							key: value,
							label: nameById.get(value) ?? unknown,
							count,
							isSelected: filters[filter].has(value),
							onToggle: () => setFilters({ [filter]: toggle(filters[filter], value) }),
						},
					]
				: [],
		);

	// Only the linked side is drawn, since no filter selects its opposite.
	const linked: SummaryGroup = {
		key: 'habitat',
		label: 'Linked to a Habitat',
		count: (summary.groups.habitat ?? []).find((group) => group.value === true)?.count ?? 0,
		isSelected: filters.habitat,
		onToggle: () => setFilters({ habitat: !filters.habitat }),
	};

	const released: SummaryGroup[] = (summary.breakdowns?.amountReleased ?? []).flatMap(
		({ by, count, sum }) => {
			const { unitId } = by;
			if (typeof unitId !== 'string') {
				return [];
			}
			const unit = unitById.get(unitId);
			return [
				{
					key: unitId,
					label: unit?.unitName ?? 'Unknown unit',
					count,
					figure: formatAmount(sum, unit),
				},
			];
		},
	);

	return [
		{
			key: 'method',
			title: 'Method',
			groups: idGroups('biocontrolMethodId', 'methods', methodNameById, 'Unknown method'),
		},
		{
			key: 'technician',
			title: 'Technician',
			groups: idGroups('technicianProfileId', 'people', personNameById, 'Unknown person'),
		},
		// A flag no biocontrol action in view carries is not drawn, because
		// clicking it would empty the panel.
		{ key: 'habitat', title: 'Habitat', groups: linked.count > 0 ? [linked] : [] },
		{ key: 'released', title: 'Amount Released', groups: released },
	];
}
