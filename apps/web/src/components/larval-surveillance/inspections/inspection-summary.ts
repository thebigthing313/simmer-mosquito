import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { inspectionFilterDeclarations } from '../inspection-filters';
import type { InspectionFilters } from '../inspections-search';

/**
 * The five groupings the Inspections summary draws out of the counts
 * `/map/inspections/summary` answers. Each is a declared filter's toggle
 * group, Water, Density, Larvae found, Habitat type and Inspector. A value no filter
 * selects, an inspection with no density, type or inspector, is drawn as text.
 */
export function inspectionSummaryGroupings({
	summary,
	filters,
	setFilters,
	typeNameById,
	inspectorNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: InspectionFilters;
	readonly setFilters: (patch: Partial<InspectionFilters>) => void;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly inspectorNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	return declaredSummaryGroupings(
		inspectionFilterDeclarations,
		['water', 'density', 'positive', 'types', 'inspectors'],
		{
			summary,
			filters,
			setFilters,
			names: { types: typeNameById, inspectors: inspectorNameById },
		},
	);
}
