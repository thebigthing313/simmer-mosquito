import type { LarvalDensity } from '@simmer-mosquito/domain';
import type { RecordSetSurface } from '../../components/explorer/record-set';
import type {
	InspectionFilterBinding,
	InspectionFilterSetters,
	InspectionFilterState,
} from '../../components/larval-surveillance/inspection-filters';
import {
	inspectionRecordSet,
	type WaterFilterValue,
} from '../../components/larval-surveillance/inspections-search';
import { useRecordSetFilters } from '../explorer/use-record-set-filters';

/**
 * The inspection filters one surface reads, as a plain value and a setter per
 * filter: the inspection filter bar's shape over `useRecordSetFilters`.
 */
export function useInspectionFilterState(surface: RecordSetSurface): InspectionFilterBinding {
	const {
		filters: query,
		setFilters,
		reset,
		activeCount,
		defaults,
		today,
	} = useRecordSetFilters(inspectionRecordSet, surface);

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
