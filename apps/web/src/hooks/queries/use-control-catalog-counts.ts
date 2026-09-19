import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { formulations } from '../../lib/collections/formulations';
import { insecticides } from '../../lib/collections/insecticides';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { useActiveCount } from './use-active-count';

export interface ControlCatalogCounts {
	readonly applicationMethods: number;
	readonly insecticides: number;
	readonly formulations: number;
	readonly sourceReductionMethods: number;
	readonly biocontrolMethods: number;
}

/** How many rows are active in each of the five control-operations catalogs. */
export function useControlCatalogCounts(): ControlCatalogCounts {
	return {
		applicationMethods: useActiveCount(application_methods()),
		insecticides: useActiveCount(insecticides()),
		formulations: useActiveCount(formulations()),
		sourceReductionMethods: useActiveCount(source_reduction_methods()),
		biocontrolMethods: useActiveCount(biocontrol_methods()),
	};
}
