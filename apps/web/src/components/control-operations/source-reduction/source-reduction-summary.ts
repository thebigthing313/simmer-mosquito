import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { formatAmount } from '../control-display';
import type { SourceReductionFilters } from './source-reductions-search';

/** A filter on the Source Reductions page that takes a set of ids. */
type IdSetFilter = 'methods' | 'people';

/**
 * The Source Reductions summary's two groupings and its sources eliminated, out
 * of what `/map/source-reduction/summary` answers, each value wired to the
 * filter it names.
 *
 * A method is added to `methods` and a technician to `people`. A value the
 * filter already holds is selected, and clicking it widens back out by taking
 * the value out of the set. Names come from the catalogs the chips read, since
 * the server answers ids. Sources eliminated are drawn as text, one line per
 * unit.
 */
export function sourceReductionSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
	personNameById,
	unitById,
}: {
	readonly summary: MapSummary;
	readonly filters: SourceReductionFilters;
	readonly setFilters: (patch: Partial<SourceReductionFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<
		string,
		{ readonly unitName: string; readonly abbreviation: string }
	>;
}): readonly SummaryGrouping[] {
	// A source reduction with no technician has no filter value to set, so its
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

	const eliminated: SummaryGroup[] = (summary.breakdowns?.sourcesEliminated ?? []).flatMap(
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
			groups: idGroups('sourceReductionMethodId', 'methods', methodNameById, 'Unknown method'),
		},
		{
			key: 'technician',
			title: 'Technician',
			groups: idGroups('technicianProfileId', 'people', personNameById, 'Unknown person'),
		},
		{ key: 'eliminated', title: 'Sources Eliminated', groups: eliminated },
	];
}
