import type { ControlType } from '@simmer-mosquito/domain';
import { methodsForControlType } from '../../routes/operations/-operations-data';
import {
	type SchemaCatalogListing,
	useApplicationMethodRoster,
	useBiocontrolMethodRoster,
	useOutreachMethodRoster,
	useSourceReductionMethodRoster,
} from '../queries/use-catalog-rosters';
/**
 * The method catalog for a control type, re-sourced from the four rosters as
 * the type changes.
 */
export function useMethodsForControlType(controlType: ControlType | ''): {
	readonly methods: readonly SchemaCatalogListing[];
} {
	const applicationMethods = useApplicationMethodRoster();
	const sourceReductionMethods = useSourceReductionMethodRoster();
	const biocontrolMethods = useBiocontrolMethodRoster();
	const outreachMethods = useOutreachMethodRoster();

	return {
		methods: methodsForControlType(controlType, {
			applicationMethods,
			sourceReductionMethods,
			biocontrolMethods,
			outreachMethods,
		}),
	};
}
