import { type ActivityLookups, activityLookups } from '../../components/activity/activity-data';
import { useTagOptions } from '../explorer/use-tag-options';
import { useApplicationMethodRoster } from '../queries/use-application-method-roster';
import { useBiocontrolMethodRoster } from '../queries/use-biocontrol-method-roster';
import { useCollectionMethodRoster } from '../queries/use-collection-method-roster';
import { useHabitatTypeRoster } from '../queries/use-habitat-type-roster';
import { useInsecticideRecords } from '../queries/use-insecticide-records';
import { useOutreachMethodRoster } from '../queries/use-outreach-method-roster';
import { useSourceReductionMethodRoster } from '../queries/use-source-reduction-method-roster';
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
