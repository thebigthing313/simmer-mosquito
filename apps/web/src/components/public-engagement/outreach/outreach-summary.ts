import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { formatReach } from '../public-engagement-display';
import type { OutreachFilters } from './outreach-actions-search';

/** A filter on the Outreach Actions page that takes a set of ids. */
type IdSetFilter = 'methods' | 'people';

/**
 * The Outreach Actions summary's two groupings and its total reach, out of
 * what `/map/outreach/summary` answers, each value wired to the filter it
 * names.
 *
 * A method is added to `methods` and a technician to `people`. A value the
 * filter already holds is selected, and clicking it widens back out: the id
 * leaves the set. Names come from the catalogs the chips read, since the
 * server answers ids. The total reach is drawn as text, because no filter
 * selects a figure.
 */
export function outreachSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
	personNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: OutreachFilters;
	readonly setFilters: (patch: Partial<OutreachFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	// An outreach action with no technician has no filter value to set, so its
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

	const reachTotal = summary.figures?.reachTotal;

	return [
		{
			key: 'method',
			title: 'Method',
			groups: idGroups('outreachMethodId', 'methods', methodNameById, 'Unknown method'),
		},
		{
			key: 'technician',
			title: 'Technician',
			groups: idGroups('technicianProfileId', 'people', personNameById, 'Unknown person'),
		},
		{
			key: 'totals',
			title: 'Totals',
			groups:
				reachTotal === undefined
					? []
					: [
							{
								key: 'reach',
								label: 'Total reach',
								count: reachTotal,
								figure: formatReach(reachTotal),
							},
						],
		},
	];
}
