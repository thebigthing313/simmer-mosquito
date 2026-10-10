import { catalogs } from '../queries/catalog-register';
import { useCatalogOptions } from './use-catalog-options';

/**
 * Every control method by id, across the four method catalogs.
 *
 * For a surface that holds a method id without knowing which catalog it came
 * from: `recommended_method_id` on a request and `planned_method_id` on a
 * mission point at a different table for each control type.
 */
export function useControlMethodNames(): ReadonlyMap<string, string> {
	const application = useCatalogOptions(catalogs.applicationMethods);
	const sourceReduction = useCatalogOptions(catalogs.sourceReductionMethods);
	const biocontrol = useCatalogOptions(catalogs.biocontrolMethods);
	const outreach = useCatalogOptions(catalogs.outreachMethods);

	return new Map([
		...application.nameById,
		...sourceReduction.nameById,
		...biocontrol.nameById,
		...outreach.nameById,
	]);
}
