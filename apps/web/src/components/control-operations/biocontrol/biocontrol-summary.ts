import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { formatAmount } from '../control-display';
import type { BiocontrolFilters } from './biocontrol-actions-search';
import { biocontrolFilterDeclarations } from './biocontrol-filters';

/**
 * The Biocontrol Actions summary's three groupings and its amount released,
 * out of what `/map/biocontrol/summary` answers.
 *
 * Method, Technician and Habitat are the declared filters' toggle groups, a
 * biocontrol action with no technician left out since no filter selects it.
 * The amount released is drawn as text, one line per unit.
 */
export function biocontrolSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
	personNameById,
	unitById,
}: {
	readonly summary: MapSummary;
	readonly filters: BiocontrolFilters;
	readonly setFilters: (patch: Partial<BiocontrolFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<
		string,
		{ readonly unitName: string; readonly abbreviation: string }
	>;
}): readonly SummaryGrouping[] {
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

	return [
		...declaredSummaryGroupings(biocontrolFilterDeclarations, ['methods', 'people', 'habitat'], {
			summary,
			filters,
			setFilters,
			names: { methods: methodNameById, people: personNameById },
		}),
		{ key: 'released', title: 'Amount Released', groups: released },
	];
}
