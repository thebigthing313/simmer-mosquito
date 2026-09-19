import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

/**
 * The record the map selection points at, whether or not it is on this page.
 *
 * Reads the selected row off `rows` first. Once the page has settled and does
 * not hold the row, fetches it by id from `${path}/${id}` and reads it under
 * `rowKey`. Returns `null` while nothing is selected or the record is not yet
 * in hand.
 */
export function useSelectedMapRecord<TRow extends { readonly id: string }>({
	path,
	rowKey,
	rows,
	pageSettled,
	selectedId,
	normalizeRow,
}: {
	readonly path: string;
	/** The key the record arrives under in the response body, e.g. `sourceReduction`. */
	readonly rowKey: string;
	readonly rows: readonly TRow[];
	/** `PagedMapResource.isSettled`: whether `rows` is the page's answer rather than its absence. */
	readonly pageSettled: boolean;
	readonly selectedId: string | null;
	readonly normalizeRow?: (row: TRow) => TRow;
}): TRow | null {
	const visibleById = new Map(rows.map((row) => [row.id, row]));
	const needsFetch = pageSettled && selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: [path, 'detail', selectedId],
		queryFn: ({ signal }) => fetchRecord<TRow>(path, rowKey, selectedId ?? '', signal),
	});

	if (selectedId === null) {
		return null;
	}
	const onPage = visibleById.get(selectedId);
	if (onPage !== undefined) {
		return onPage;
	}
	const fetched = query.data ?? null;
	if (fetched === null) {
		return null;
	}
	return normalizeRow === undefined ? fetched : normalizeRow(fetched);
}

async function fetchRecord<TRow>(
	path: string,
	rowKey: string,
	id: string,
	signal: AbortSignal,
): Promise<TRow | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await sessionFetch(new URL(`${path}/${id}`, getServerUrl()), { signal });
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as Record<string, unknown>;
	const row = body[rowKey];
	return row === undefined || row === null ? null : (row as TRow);
}
