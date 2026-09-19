import { type ActivityLookups, activityLookups } from '../../routes/-activity-data';
import { useTagOptions } from '../explorer/use-tag-options';
import {
	useApplicationMethodRoster,
	useBiocontrolMethodRoster,
	useCollectionMethodRoster,
	useHabitatTypeRoster,
	useOutreachMethodRoster,
	useSourceReductionMethodRoster,
} from '../queries/use-catalog-rosters';
import { useInsecticideRecords } from '../queries/use-insecticide-records';
import { useUnitLabels } from '../queries/use-unit-labels';

/** The catalog lookups an activity log names its records with. */
export function useActivityLookups(): ActivityLookups {
	const habitatTypes = useHabitatTypeRoster();
	const collectionMethods = useCollectionMethodRoster();
	const applicationMethods = useApplicationMethodRoster();
	const sourceReductionMethods = useSourceReductionMethodRoster();
	const biocontrolMethods = useBiocontrolMethodRoster();
	const outreachMethods = useOutreachMethodRoster();
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
