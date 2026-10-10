import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { formatAmount } from '../control-display';
import { sourceReductionFilterDeclarations } from './source-reduction-filters';
import type { SourceReductionFilters } from './source-reductions-search';

/**
 * The Source Reductions summary's two groupings and its sources eliminated, out
 * of what `/map/source-reduction/summary` answers.
 *
 * Method and Technician are the declared filters' toggle groups, a source
 * reduction with no technician left out since no filter selects it. Sources
 * eliminated are drawn as text, one line per unit.
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
		...declaredSummaryGroupings(sourceReductionFilterDeclarations, ['methods', 'people'], {
			summary,
			filters,
			setFilters,
			names: { methods: methodNameById, people: personNameById },
		}),
		{ key: 'eliminated', title: 'Sources Eliminated', groups: eliminated },
	];
}
