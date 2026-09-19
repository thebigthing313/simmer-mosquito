/**
 * What the insecticides page hands to every surface below it. Its own module
 * because the table renders the batch panel, so the panel cannot import the
 * type from the table without a cycle.
 */

import type {
	InsecticideBatchMutations,
	InsecticideMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';

export type InsecticideCatalog = {
	/**
	 * Every product, active and retired. The batch drawer's product selector reads
	 * this; the subset a table draws travels separately as its `shownProducts`.
	 */
	readonly allProducts: readonly InsecticideRecord[];
	readonly batchMutations: InsecticideBatchMutations;
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly mutations: InsecticideMutations;
	readonly units: readonly UnitLabel[];
};
