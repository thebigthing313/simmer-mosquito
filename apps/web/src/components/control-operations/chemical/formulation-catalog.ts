/**
 * What the formulations page hands to every surface below it. Its own module
 * because the section renders the product panel and both open a drawer, so no
 * one of them can own the type without a cycle.
 */

import type { FormulationMutations } from '../../../hooks/mutations/use-formulation-mutations';
import type { FormulationComponentRecord } from '../../../hooks/queries/use-formulation-records';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import type { UnitLabel, UnitType } from '../../../hooks/queries/use-unit-labels';

export type FormulationCatalog = {
	readonly canManage: boolean;
	readonly componentsByFormulation: ReadonlyMap<string, readonly FormulationComponentRecord[]>;
	readonly insecticideById: ReadonlyMap<string, InsecticideRecord>;
	/** Every product, active and retired. The product drawer narrows it. */
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: FormulationMutations;
	readonly unitById: ReadonlyMap<string, UnitLabel>;
	readonly units: readonly UnitLabel[];
};

/** A mix and its products are measured the way a treatment is measured. */
export function isRecipeUnitType(unitType: UnitType): boolean {
	return unitType === 'volume' || unitType === 'weight' || unitType === 'count';
}
