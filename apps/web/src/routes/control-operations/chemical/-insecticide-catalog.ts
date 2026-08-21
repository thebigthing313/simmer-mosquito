/**
 * What the insecticides page hands to every surface below it: the two mutation
 * handles, the batch-tracking gate, the manage permission, the usage units, and
 * the whole product catalog.
 *
 * The route builds one of these and passes it down unchanged. It lives in its
 * own module because the table renders the batch panel, so the panel cannot
 * import the type from the table without a cycle.
 */

import type {
	InsecticideBatchMutations,
	InsecticideMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';

export type InsecticideCatalog = {
	/**
	 * Every product, active and retired. The batch drawer's product selector
	 * reads this, so it must not be narrowed to the subset a table is drawing.
	 * That subset travels separately, as the table's `shownProducts`.
	 */
	readonly allProducts: readonly InsecticideRecord[];
	readonly batchMutations: InsecticideBatchMutations;
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly mutations: InsecticideMutations;
	readonly units: readonly UnitLabel[];
};
