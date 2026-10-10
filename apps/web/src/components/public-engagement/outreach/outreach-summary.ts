import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { formatReach } from '../public-engagement-display';
import type { OutreachFilters } from './outreach-actions-search';
import { outreachFilterDeclarations } from './outreach-filters';

/**
 * The Outreach Actions summary's two groupings and its total reach, out of
 * what `/map/outreach/summary` answers.
 *
 * Method and Technician are the declared filters' toggle groups, an outreach
 * action with no technician left out since no filter selects it. The total
 * reach is drawn as text, because no filter selects a figure.
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
	const reachTotal = summary.figures?.reachTotal;

	return [
		...declaredSummaryGroupings(outreachFilterDeclarations, ['methods', 'people'], {
			summary,
			filters,
			setFilters,
			names: { methods: methodNameById, people: personNameById },
		}),
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
