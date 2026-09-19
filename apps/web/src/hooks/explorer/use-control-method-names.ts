import { useApplicationMethodOptions } from './use-application-method-options';
import { useBiocontrolMethodOptions } from './use-biocontrol-method-options';
import { useOutreachMethodOptions } from './use-outreach-method-options';
import { useSourceReductionMethodOptions } from './use-source-reduction-method-options';

/**
 * Every control method by id, across the four method catalogs.
 *
 * For a surface that holds a method id without knowing which catalog it came
 * from: `recommended_method_id` on a request and `planned_method_id` on a
 * mission point at a different table for each control type.
 */
export function useControlMethodNames(): ReadonlyMap<string, string> {
	const application = useApplicationMethodOptions();
	const sourceReduction = useSourceReductionMethodOptions();
	const biocontrol = useBiocontrolMethodOptions();
	const outreach = useOutreachMethodOptions();

	return new Map([
		...application.nameById,
		...sourceReduction.nameById,
		...biocontrol.nameById,
		...outreach.nameById,
	]);
}
