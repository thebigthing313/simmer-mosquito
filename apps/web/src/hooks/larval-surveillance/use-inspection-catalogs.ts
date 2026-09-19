import type { InspectionCatalogs } from '../../components/larval-surveillance/inspection-filters';
import { useHabitatTypeOptions } from '../explorer/use-habitat-type-options';
import { usePersonnelOptions } from '../explorer/use-personnel-options';

/** The two eager catalogs a filtered row is labelled from. */
export function useInspectionCatalogs(): InspectionCatalogs {
	const habitatTypes = useHabitatTypeOptions();
	const personnel = usePersonnelOptions();
	return {
		habitatTypes: habitatTypes.options,
		personnel: personnel.options,
		typeNameById: habitatTypes.nameById,
		personnelNameById: personnel.nameById,
	};
}
