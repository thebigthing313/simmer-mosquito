import type { InspectionCatalogs } from '../../routes/larval-surveillance/-inspection-filters';
import { useRegionOptions } from '../explorer/use-region-options';
import { useInspectionCatalogs } from './use-inspection-catalogs';

/** The catalogs the filter controls offer, and the names their chips read by. */
export interface InspectionFilterOptions {
	readonly catalogs: InspectionCatalogs;
	readonly regions: ReturnType<typeof useRegionOptions>;
}

/** The catalogs the filter controls read from: the shared two, plus Region. */
export function useInspectionFilterOptions(): InspectionFilterOptions {
	const catalogs = useInspectionCatalogs();
	const regions = useRegionOptions();
	return { catalogs, regions };
}
