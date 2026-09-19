import type { ControlType } from '@simmer-mosquito/domain';
import { methodsForControlType } from '../../routes/operations/-operations-data';
import type { SchemaCatalogListing } from '../queries/catalog-roster-view';
import { useApplicationMethodRoster } from '../queries/use-application-method-roster';
import { useBiocontrolMethodRoster } from '../queries/use-biocontrol-method-roster';
import { useOutreachMethodRoster } from '../queries/use-outreach-method-roster';
import { useSourceReductionMethodRoster } from '../queries/use-source-reduction-method-roster';
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
