import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';

/**
 * The Samples summary's larvae identified, out of the figure
 * `/map/samples/summary` answers, drawn as text after the declared Status,
 * Species and Material groupings, because no filter selects a figure.
 */
export function sampleSummaryFigures(summary: MapSummary): readonly SummaryGrouping[] {
	const larvaeTotal = summary.figures?.larvaeTotal;

	return [
		{
			key: 'totals',
			title: 'Totals',
			groups:
				larvaeTotal === undefined
					? []
					: [{ key: 'larvae-identified', label: 'Larvae identified', count: larvaeTotal }],
		},
	];
}
