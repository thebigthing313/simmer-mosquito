import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { formatAmount } from '../control-display';
import { insecticideName } from './application-row-parts';

/**
 * The Chemical Applications summary's amount applied, out of the breakdown
 * `/map/chemical/summary` answers, drawn as text one line per insecticide and
 * unit after the declared Insecticide, Method and Applicator groupings.
 */
export function applicationSummaryFigures(
	summary: MapSummary,
	{
		insecticideNameById,
		unitById,
	}: {
		readonly insecticideNameById: ReadonlyMap<string, string>;
		readonly unitById: ReadonlyMap<string, { readonly abbreviation: string }>;
	},
): readonly SummaryGrouping[] {
	const amounts: SummaryGroup[] = (summary.breakdowns?.amountApplied ?? []).flatMap(
		({ by, count, sum }) => {
			const { insecticideId, unitId } = by;
			if (typeof insecticideId !== 'string' || typeof unitId !== 'string') {
				return [];
			}
			return [
				{
					key: `${insecticideId}:${unitId}`,
					label: insecticideName(insecticideId, insecticideNameById),
					count,
					figure: formatAmount(sum, unitById.get(unitId)),
				},
			];
		},
	);

	return [{ key: 'amount', title: 'Amount Applied', groups: amounts }];
}
