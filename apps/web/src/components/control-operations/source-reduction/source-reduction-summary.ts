import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { perUnitAmountGroups } from '../control-display';

/**
 * The Source Reductions summary's sources eliminated, out of the breakdown
 * `/map/source-reduction/summary` answers, drawn as text one line per unit
 * after the declared Method and Technician groupings.
 */
export function sourceReductionSummaryFigures(
	summary: MapSummary,
	unitById: ReadonlyMap<string, { readonly unitName: string; readonly abbreviation: string }>,
): readonly SummaryGrouping[] {
	const eliminated = perUnitAmountGroups(summary.breakdowns?.sourcesEliminated ?? [], unitById);
	return [{ key: 'eliminated', title: 'Sources Eliminated', groups: eliminated }];
}
