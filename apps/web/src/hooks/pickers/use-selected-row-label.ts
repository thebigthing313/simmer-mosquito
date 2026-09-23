import { type Collection, eq, useLiveQuery } from '@tanstack/react-db';
import { unmatchableId } from '../queries/shared';

const selectedGcTimeMs = 30_000;

/** What every synced row carries, and all this lookup needs. */
interface IdentifiedRow {
	readonly [key: string]: unknown;
	readonly id: string;
}

/**
 * The label a picker shows for its current selection: what was just picked,
 * else the row read back by id from `collection`, else empty while that row is
 * still streaming in.
 */
export function useSelectedRowLabel<TRow extends IdentifiedRow>({
	collection,
	value,
	pickedLabel,
	toLabel,
}: {
	readonly collection: Collection<TRow, string | number>;
	readonly value: string | null;
	readonly pickedLabel: string;
	readonly toLabel: (row: TRow) => string;
}): string {
	const queryId = value ?? unmatchableId;
	// The query builder resolves column refs off a concrete row type, so the lookup
	// runs against the shared `id` shape every synced row satisfies.
	const rows = collection as unknown as Collection<IdentifiedRow, string | number>;
	const { data } = useLiveQuery({
		gcTime: selectedGcTimeMs,
		// No `limit` — an id equality already yields at most one row, and the query
		// compiler rejects LIMIT without an ORDER BY.
		query: (query) => query.from({ row: rows }).where(({ row }) => eq(row.id, queryId)),
	});

	if (value === null) {
		return '';
	}
	if (pickedLabel.length > 0) {
		return pickedLabel;
	}
	const [selected] = (data ?? []) as unknown as readonly TRow[];
	return selected === undefined ? '' : toLabel(selected);
}
