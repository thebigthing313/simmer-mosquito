import { type BoundingBox, isBoundingBox } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';

const extentStaleTimeMs = 30_000;

/** What the extent endpoint has said about one filter set. */
export interface MapExtent {
	/**
	 * The box every row the filters select fits in, or null. Null before the
	 * request has answered and null when the server said nothing matched; read
	 * `isSettled` to tell those apart.
	 */
	readonly extent: BoundingBox | null;
	/** The request has answered, with a box, with null, or with an error. */
	readonly isSettled: boolean;
	readonly isError: boolean;
}

/**
 * The extent of one tileset's filtered set, keyed on the extent URL.
 *
 * A `null` URL asks for nothing and never settles.
 */
export function useMapExtent(url: string | null): MapExtent {
	const query = useQuery({
		enabled: url !== null,
		queryKey: ['map-extent', url],
		queryFn: ({ signal }) => fetchMapExtent(url ?? '', signal),
		staleTime: extentStaleTimeMs,
	});
	return {
		extent: query.data ?? null,
		isSettled: query.status !== 'pending',
		isError: query.isError,
	};
}

async function fetchMapExtent(url: string, signal: AbortSignal): Promise<BoundingBox | null> {
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Map extent request failed (${response.status}).`);
	}

	const body = (await response.json()) as { readonly extent?: BoundingBox | null };
	// Null is the server's "nothing matched"; the caller keeps its current view.
	const extent = body.extent ?? null;
	return extent !== null && isBoundingBox(extent) ? extent : null;
}
