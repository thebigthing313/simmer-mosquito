import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { formatAmount } from '../control-display';

/**
 * The Source Reductions summary's sources eliminated, out of the breakdown
 * `/map/source-reduction/summary` answers, drawn as text one line per unit
 * after the declared Method and Technician groupings.
 */
export function sourceReductionSummaryFigures(
	summary: MapSummary,
	unitById: ReadonlyMap<string, { readonly unitName: string; readonly abbreviation: string }>,
): readonly SummaryGrouping[] {
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

	return [{ key: 'eliminated', title: 'Sources Eliminated', groups: eliminated }];
}
