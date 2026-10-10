import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import type { SampleFilters } from '../samples-search';
import { sampleFilterDeclarations } from './sample-filters';

/**
 * The Samples summary's three groupings and its figure, out of what
 * `/map/samples/summary` answers.
 *
 * Status, Species and Material are the declared filters' toggle groups. The
 * larvae identified are drawn as text, because no filter selects a figure.
 */
export function sampleSummaryGroupings({
	summary,
	filters,
	setFilters,
	speciesNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: SampleFilters;
	readonly setFilters: (patch: Partial<SampleFilters>) => void;
	readonly speciesNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	const larvaeTotal = summary.figures?.larvaeTotal;

	return [
		...declaredSummaryGroupings(sampleFilterDeclarations, ['status', 'species', 'nonMosquito'], {
			summary,
			filters,
			setFilters,
			names: { species: speciesNameById },
		}),
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
