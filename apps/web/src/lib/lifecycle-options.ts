/**
 * Options for the catalog selects on record forms.
 *
 * Deactivating a product, lure, or profile means "stop reaching for this", not
 * "this never happened" — and these same forms are where past seasons get keyed
 * in. So nothing is withheld: retired rows stay selectable, marked so they are
 * not picked by accident, and sorted behind everything still in service.
 */

/** Structurally both a `FieldOption` and a `MultiSelectOption`. */
export interface LifecycleOption {
	readonly label: string;
	readonly value: string;
}

/** Mark a row that is out of service without hiding it. */
export function lifecycleLabel(label: string, isActive: boolean): string {
	return isActive ? label : `${label} (inactive)`;
}

export function lifecycleOptions<TRow extends { readonly id: string }>(
	rows: readonly TRow[],
	isActive: (row: TRow) => boolean,
	toLabel: (row: TRow) => string,
): readonly LifecycleOption[] {
	return rows
		.map((row) => ({ active: isActive(row), label: toLabel(row), value: row.id }))
		.sort(
			(first, second) =>
				Number(second.active) - Number(first.active) || first.label.localeCompare(second.label),
		)
		.map((row) => ({ label: lifecycleLabel(row.label, row.active), value: row.value }));
}
