import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { formatAmount } from '../control-display';

/**
 * The Biocontrol Actions summary's amount released, out of the breakdown
 * `/map/biocontrol/summary` answers, drawn as text one line per unit after the
 * declared Method, Technician and Habitat groupings.
 */
export function biocontrolSummaryFigures(
	summary: MapSummary,
	unitById: ReadonlyMap<string, { readonly unitName: string; readonly abbreviation: string }>,
): readonly SummaryGrouping[] {
	const released: SummaryGroup[] = (summary.breakdowns?.amountReleased ?? []).flatMap(
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

	return [{ key: 'released', title: 'Amount Released', groups: released }];
}
