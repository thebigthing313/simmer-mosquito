import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { formatReach } from '../public-engagement-display';

/**
 * The Outreach Actions summary's total reach, out of the figure
 * `/map/outreach/summary` answers, drawn as text after the declared Method and
 * Technician groupings, because no filter selects a figure.
 */
export function outreachSummaryFigures(summary: MapSummary): readonly SummaryGrouping[] {
	const reachTotal = summary.figures?.reachTotal;

	return [
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
