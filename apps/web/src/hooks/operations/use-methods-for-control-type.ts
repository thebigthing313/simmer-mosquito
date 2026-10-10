import type { ControlType } from '@simmer-mosquito/domain';
import { methodsForControlType } from '../../components/operations/operations-data';
import { catalogs } from '../queries/catalog-register';
import type { SchemaCatalogListing } from '../queries/catalog-roster-view';
import { useCatalogRoster } from '../queries/use-catalog-roster';
/**
 * The method catalog for a control type, re-sourced from the four rosters as
 * the type changes.
 */
export function useMethodsForControlType(controlType: ControlType | ''): {
	readonly methods: readonly SchemaCatalogListing[];
} {
	const applicationMethods = useCatalogRoster(catalogs.applicationMethods);
	const sourceReductionMethods = useCatalogRoster(catalogs.sourceReductionMethods);
	const biocontrolMethods = useCatalogRoster(catalogs.biocontrolMethods);
	const outreachMethods = useCatalogRoster(catalogs.outreachMethods);

	return {
		methods: methodsForControlType(controlType, {
			applicationMethods,
			sourceReductionMethods,
			biocontrolMethods,
			outreachMethods,
		}),
	};
}
