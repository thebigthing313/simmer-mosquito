import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { habitatFilterDeclarations } from './habitat-filters';
import type { HabitatFilters } from './habitats-search';

/**
 * The four groupings the Habitats summary draws, out of the counts
 * `/map/habitats/summary` answers: the declared Habitat type, Status, Access
 * and Untreated filters' toggle groups. A habitat with no type is counted and
 * drawn as text, because no filter selects it.
 */
export function habitatSummaryGroupings({
	summary,
	filters,
	setFilters,
	typeNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: HabitatFilters;
	readonly setFilters: (patch: Partial<HabitatFilters>) => void;
	readonly typeNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	return declaredSummaryGroupings(
		habitatFilterDeclarations,
		['typeIds', 'status', 'access', 'untreated'],
		{ summary, filters, setFilters, names: { typeIds: typeNameById } },
	);
}
