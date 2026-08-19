import type { UnitLabel, UnitType } from '../hooks/queries/use-unit-labels';

/**
 * Options for a form's unit select, narrowed to the unit types the field can
 * meaningfully carry.
 *
 * The whole unit catalog is one list — weights, areas, durations, counts — so an
 * unfiltered select offers hours where a weight belongs and pounds where a trap's
 * run length belongs. The domain says which types each field accepts
 * (`isBiocontrolUnitType`, `isCollectionDurationUnitType`, and friends); this
 * turns that into the list a form shows.
 *
 * Sorted by name, because a unit select is scanned for a specific unit rather
 * than read through, and the catalog's own order is an implementation detail.
 */
export function unitOptions(
	units: readonly UnitLabel[],
	isAllowed: (unitType: UnitType) => boolean,
): readonly { readonly label: string; readonly value: string }[] {
	return units
		.filter((unit) => isAllowed(unit.unitType))
		.slice()
		.sort((first, second) => first.unitName.localeCompare(second.unitName))
		.map((unit) => ({ label: `${unit.unitName} (${unit.abbreviation})`, value: unit.id }));
}
