import { type ActivityLookups, activityLookups } from '../../components/activity/activity-data';
import { useTagOptions } from '../explorer/use-tag-options';
import { catalogs } from '../queries/catalog-register';
import { useCatalogRoster } from '../queries/use-catalog-roster';
import { useInsecticideRecords } from '../queries/use-insecticide-records';
import { useUnitLabels } from '../queries/use-unit-labels';

/** The catalog lookups an activity log names its records with. */
export function useActivityLookups(): ActivityLookups {
	const habitatTypes = useCatalogRoster(catalogs.habitatTypes);
	const collectionMethods = useCatalogRoster(catalogs.collectionMethods);
	const applicationMethods = useCatalogRoster(catalogs.applicationMethods);
	const sourceReductionMethods = useCatalogRoster(catalogs.sourceReductionMethods);
	const biocontrolMethods = useCatalogRoster(catalogs.biocontrolMethods);
	const outreachMethods = useCatalogRoster(catalogs.outreachMethods);
	const insecticides = useInsecticideRecords();
	const { all: units } = useUnitLabels();
	const { byId: tagById } = useTagOptions();

	return activityLookups(
		[
			habitatTypes,
			collectionMethods,
			applicationMethods,
			sourceReductionMethods,
			biocontrolMethods,
			outreachMethods,
		],
		insecticides,
		units,
		tagById,
	);
}
