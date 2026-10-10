import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { formatAmount } from '../control-display';
import { applicationFilterDeclarations } from './application-filters';
import { insecticideName } from './application-row-parts';
import type { ApplicationFilters } from './applications-search';

/**
 * The Chemical Applications summary's three groupings and its amounts, out of
 * what `/map/chemical/summary` answers.
 *
 * Insecticide, Method and Applicator are the declared filters' toggle groups,
 * an application with no method or no applicator left out since no filter
 * selects it. The amount applied is drawn as text, one line per insecticide
 * and unit.
 */
export function applicationSummaryGroupings({
	summary,
	filters,
	setFilters,
	insecticideNameById,
	methodNameById,
	personNameById,
	unitById,
}: {
	readonly summary: MapSummary;
	readonly filters: ApplicationFilters;
	readonly setFilters: (patch: Partial<ApplicationFilters>) => void;
	readonly insecticideNameById: ReadonlyMap<string, string>;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, { readonly abbreviation: string }>;
}): readonly SummaryGrouping[] {
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

	return [
		...declaredSummaryGroupings(
			applicationFilterDeclarations,
			['insecticides', 'methods', 'people'],
			{
				summary,
				filters,
				setFilters,
				names: {
					insecticides: insecticideNameById,
					methods: methodNameById,
					people: personNameById,
				},
			},
		),
		{ key: 'amount', title: 'Amount Applied', groups: amounts },
	];
}
