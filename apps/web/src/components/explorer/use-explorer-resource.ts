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
 * two keys its body answers under, the noun a failure reads by, the filters, and
 * whether the list follows the viewport.
 */
export function useExplorerResource<TRow extends ExplorerRowShape>({
	path,
	rowsKey,
	rowKey,
	label,
	params,
	viewport,
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
	/**
	 * Bind the list to what the map is looking at.
	 *
	 * Temporary, and a parameter rather than a constant because the flip is one
	 * surface at a time: only `listByBounds` reads `bbox`, so a surface joins when
	 * its server reader does (#920). The flag goes with the last one.
	 */
	readonly viewport: boolean;
	readonly map: MapboxMap | null;
	readonly selectedId: string | null;
	/** Defaults a row's newer fields, where a deployed server may not send them. */
	readonly normalizeRow?: (row: TRow) => TRow;
}): ExplorerResource<TRow> {
	// Handing the bounds hook a null map on a surface that does not follow the
	// viewport leaves no camera listener on it at all, so panning re-renders
	// nothing there.
	const bbox = useMapBoundsParam(viewport ? map : null);
	// Spread rather than passed, because the workspace is on
	// `exactOptionalPropertyTypes` and an explicit `undefined` is not an absent key.
	const shaping = normalizeRow === undefined ? {} : { normalizeRow };
	// `bbox` first, so a viewport-bound surface puts it on the query string ahead
	// of its own filters, which is where the three larval routes have always had it.
	const query = mapQueryParams(viewport ? { bbox, ...params } : params);

	const paged = usePagedMapResource<TRow>({
		path,
		rowsKey,
		label,
		params: query,
		// Nothing to ask for until the map has said what is in view.
		enabled: !viewport || bbox !== null,
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
