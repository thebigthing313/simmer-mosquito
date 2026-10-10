import type { InspectionCatalogs } from '../../components/larval-surveillance/inspection-filters';
import { useCatalogOptions } from '../explorer/use-catalog-options';
import { catalogs } from '../queries/catalog-register';

/** The two eager catalogs a filtered row is labelled from. */
export function useInspectionCatalogs(): InspectionCatalogs {
	const habitatTypes = useCatalogOptions(catalogs.habitatTypes);
	const personnel = useCatalogOptions(catalogs.profiles);
	return {
		habitatTypes: habitatTypes.options,
		personnel: personnel.options,
		typeNameById: habitatTypes.nameById,
		personnelNameById: personnel.nameById,
	};
}
