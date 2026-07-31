/**
 * Diff a set of link rows against the selection a form holds.
 *
 * Link tables (additional personnel, application batches, …) carry no fields of
 * their own — a row either exists or it does not — so saving one is always the
 * same three-way split: keep, detach, attach. Rows that survive are left alone
 * so unrelated audit columns are not churned.
 */
export interface LinkReconciliation<TRow> {
	/** Rows to delete — dropped selections, plus any duplicate of a kept key. */
	readonly removals: readonly TRow[];
	/** Keys with no row yet. */
	readonly additions: readonly string[];
}

export function reconcileLinks<TRow>(
	existing: readonly TRow[],
	keyOf: (row: TRow) => string,
	wantedKeys: readonly string[],
): LinkReconciliation<TRow> {
	const wanted = new Set(wantedKeys);
	const kept = new Set<string>();
	const removals: TRow[] = [];

	for (const row of existing) {
		const key = keyOf(row);
		if (wanted.has(key) && !kept.has(key)) {
			kept.add(key);
			continue;
		}
		removals.push(row);
	}

	return { removals, additions: [...wanted].filter((key) => !kept.has(key)) };
}
