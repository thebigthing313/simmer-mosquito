import { type Collection, eq, useLiveQuery } from '@tanstack/react-db';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';

/** What every synced row carries, and all this lookup needs. */
interface IdentifiedRow {
	readonly [key: string]: unknown;
	readonly id: string;
}

/**
 * The label of the row `value` names, read back by id from `collection`, or
 * `''` for no value and while that row is still streaming in. What a picker
 * shows over it after a pick is `useSearchPicker`'s rule.
 */
export function useSelectedRowLabel<TRow extends IdentifiedRow>({
	collection,
	value,
	toLabel,
}: {
	readonly collection: Collection<TRow, string | number>;
	readonly value: string | null;
	readonly toLabel: (row: TRow) => string;
}): string {
	const queryId = value ?? unmatchableId;
	// The query builder resolves column refs off a concrete row type, so the lookup
	// runs against the shared `id` shape every synced row satisfies.
	const rows = collection as unknown as Collection<IdentifiedRow, string | number>;
	const { data } = useLiveQuery({
		gcTime: activityGcTimeMs,
		// No `limit` — an id equality already yields at most one row, and the query
		// compiler rejects LIMIT without an ORDER BY.
		query: (query) => query.from({ row: rows }).where(({ row }) => eq(row.id, queryId)),
	});

	if (value === null) {
		return '';
	}
	const [selected] = (data ?? []) as unknown as readonly TRow[];
	return selected === undefined ? '' : toLabel(selected);
}
