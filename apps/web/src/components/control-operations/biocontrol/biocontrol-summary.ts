import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { perUnitAmountGroups } from '../control-display';

/**
 * The Biocontrol Actions summary's amount released, out of the breakdown
 * `/map/biocontrol/summary` answers, drawn as text one line per unit after the
 * declared Method, Technician and Habitat groupings.
 */
export function biocontrolSummaryFigures(
	summary: MapSummary,
	unitById: ReadonlyMap<string, { readonly unitName: string; readonly abbreviation: string }>,
): readonly SummaryGrouping[] {
	const released = perUnitAmountGroups(summary.breakdowns?.amountReleased ?? [], unitById);
	return [{ key: 'released', title: 'Amount Released', groups: released }];
}
