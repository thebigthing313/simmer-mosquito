import type { Map as MapboxMap } from 'mapbox-gl';
import { useFlyToSelection } from './use-fly-to-selection';
import { useMapBoundsParam } from './use-map-bounds';
import {
	type MapQueryValue,
	mapQueryParams,
	type PagedMapResource,
	usePagedMapResource,
	useSelectedMapRecord,
} from './use-paged-map-resource';

/**
 * What every explorer rail needs of a row: which record it is, and where on the
 * map it sits. A row with no coordinates is still a row, which is why both are
 * nullable here.
 */
export interface ExplorerRowShape {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
}

export interface ExplorerResource<TRow> extends PagedMapResource<TRow> {
	/** The record the map selection points at, on this page or fetched by id. */
	readonly selected: TRow | null;
}

/**
 * One page of a `/map/*` list endpoint, the record the map has selected, and the
 * camera move that follows it.
 *
 * Nine explorer routes each ran the same four hooks in the same order and spent
 * eighty lines doing it. What actually varies between them is the endpoint, the
 * two keys its body answers under, the noun a failure reads by, and the filters.
 *
 * Every one of them lists what the map is looking at. The rail is the map's
 * list, so the box goes on the wire ahead of the surface's own filters and
 * nothing is asked for until the camera has said where it is; six surfaces used
 * to page the whole Organization behind a map drawing one viewport, and the
 * `viewport` flag that told them apart went with the last of the six (#920).
 */
export function useExplorerResource<TRow extends ExplorerRowShape>({
	path,
	rowsKey,
	rowKey,
	label,
	params,
	map,
	selectedId,
	normalizeRow,
}: {
	/** The list endpoint, e.g. `/map/source-reduction`. Also roots the query key. */
	readonly path: string;
	/** The key the rows arrive under in the response body, e.g. `sourceReductions`. */
	readonly rowsKey: string;
	/** The key one record arrives under, e.g. `sourceReduction`. */
	readonly rowKey: string;
	/** Plural noun for the failure message, e.g. `Source reductions`. */
	readonly label: string;
	/** The surface's own filters, before the empties are dropped. */
	readonly params: Readonly<Record<string, MapQueryValue>>;
	readonly map: MapboxMap | null;
	readonly selectedId: string | null;
	/** Defaults a row's newer fields, where a deployed server may not send them. */
	readonly normalizeRow?: (row: TRow) => TRow;
}): ExplorerResource<TRow> {
	const bbox = useMapBoundsParam(map);
	// Spread rather than passed, because the workspace is on
	// `exactOptionalPropertyTypes` and an explicit `undefined` is not an absent key.
	const shaping = normalizeRow === undefined ? {} : { normalizeRow };
	// `bbox` first, so it sits on the query string ahead of the surface's own
	// filters, which is where the three larval routes have always had it.
	const query = mapQueryParams({ bbox, ...params });

	const paged = usePagedMapResource<TRow>({
		path,
		rowsKey,
		label,
		params: query,
		// Nothing to ask for until the map has said what is in view. A first page
		// against the whole Organization is the answer no explorer may give.
		enabled: bbox !== null,
		...shaping,
	});
	const selected = useSelectedMapRecord<TRow>({
		path,
		rowKey,
		rows: paged.rows,
		selectedId,
		...shaping,
	});
	useFlyToSelection(map, selected);

	return { ...paged, selected };
}
