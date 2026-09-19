import type { LarvalDensity } from '@simmer-mosquito/domain';
import type { FilterCounting } from '../../lib/search-filters';
import type {
	InspectionFilterBinding,
	InspectionFilterSetters,
	InspectionFilterState,
	InspectionOpeningWindow,
} from '../../routes/larval-surveillance/-inspection-filters';
import {
	type InspectionFilters,
	inspectionFilterCodecs,
	type WaterFilterValue,
} from '../../routes/larval-surveillance/-inspections-search';
import { useSearchFilters } from '../use-search-filters';
import { useInspectionFilterDefaults } from './use-inspection-filter-defaults';

/**
 * The inspection filter set, held on the URL, as a plain value and a setter
 * per filter.
 */
export function useInspectionFilterState(
	counting: FilterCounting<InspectionFilters>,
	opening: InspectionOpeningWindow,
): InspectionFilterBinding {
	const { defaults, today } = useInspectionFilterDefaults(opening);
	const {
		filters: query,
		setFilters,
		reset,
		activeCount,
	} = useSearchFilters(defaults, inspectionFilterCodecs, counting);

	const setWetness = (next: WaterFilterValue) => setFilters({ water: next });
	const setDensities = (next: ReadonlySet<LarvalDensity>) => setFilters({ density: next });
	const setPositiveOnly = (next: boolean) => setFilters({ positive: next });
	const setTypeIds = (next: ReadonlySet<string>) => setFilters({ types: next });
	const setInspectorIds = (next: ReadonlySet<string>) => setFilters({ inspectors: next });
	const setRegionIds = (next: ReadonlySet<string>) => setFilters({ regions: next });

	const state: InspectionFilterState = {
		dateFrom: query.from,
		dateTo: query.to,
		densities: query.density,
		inspectorIds: query.inspectors,
		positiveOnly: query.positive,
		regionIds: query.regions,
		typeIds: query.types,
		wetness: query.water,
	};
	const set: InspectionFilterSetters = {
		setDensities,
		setInspectorIds,
		setPositiveOnly,
		setRegionIds,
		setTypeIds,
		setWetness,
	};

	return { activeCount, defaults, reset, set, setFilters, state, today };
}
