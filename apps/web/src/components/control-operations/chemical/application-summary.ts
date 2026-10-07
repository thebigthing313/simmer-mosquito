import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { formatAmount } from '../control-display';
import { insecticideName } from './application-row-parts';
import type { ApplicationFilters } from './applications-search';

/** A filter on the Chemical Applications page that takes a set of ids. */
type IdSetFilter = 'insecticides' | 'methods' | 'people';

/**
 * The Chemical Applications summary's three groupings and its amounts, out of
 * what `/map/chemical/summary` answers, each value wired to the filter it names.
 *
 * An insecticide is added to `insecticides`, an application method to
 * `methods`, and an applicator to `people`. A value the filter already holds is
 * selected, and clicking it widens back out by taking the value out of the set.
 * Names come from the catalogs the chips read, since the server answers ids.
 * The amount applied is drawn as text, one line per insecticide and unit.
 */
export function applicationSummaryGroupings({
	summary,
	filters,
	setFilters,
	insecticideNameById,
	methodNameById,
	personNameById,
	unitById,
}: {
	readonly summary: MapSummary;
	readonly filters: ApplicationFilters;
	readonly setFilters: (patch: Partial<ApplicationFilters>) => void;
	readonly insecticideNameById: ReadonlyMap<string, string>;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, { readonly abbreviation: string }>;
}): readonly SummaryGrouping[] {
	// An application with no method or no applicator has no filter value to set,
	// so its null group is not drawn.
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

	const amounts: SummaryGroup[] = (summary.breakdowns?.amountApplied ?? []).flatMap(
		({ by, count, sum }) => {
			const { insecticideId, unitId } = by;
			if (typeof insecticideId !== 'string' || typeof unitId !== 'string') {
				return [];
			}
			return [
				{
					key: `${insecticideId}:${unitId}`,
					label: insecticideName(insecticideId, insecticideNameById),
					count,
					figure: formatAmount(sum, unitById.get(unitId)),
				},
			];
		},
	);

	return [
		{
			key: 'insecticide',
			title: 'Insecticide',
			groups: idGroups('insecticideId', 'insecticides', insecticideNameById, 'Unknown insecticide'),
		},
		{
			key: 'method',
			title: 'Method',
			groups: idGroups('applicationMethodId', 'methods', methodNameById, 'Unknown method'),
		},
		{
			key: 'applicator',
			title: 'Applicator',
			groups: idGroups('applicatorProfileId', 'people', personNameById, 'Unknown person'),
		},
		{ key: 'amount', title: 'Amount Applied', groups: amounts },
	];
}
