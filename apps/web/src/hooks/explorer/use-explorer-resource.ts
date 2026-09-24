import type { Map as MapboxMap } from 'mapbox-gl';
import type {
	ExplorerEmptiness,
	ExplorerEmptyReason,
} from '../../components/explorer/explorer-empty-state';
import { type MapTileLayer, tileLayerExtentUrl } from '../../components/map/tile-layers';
import type { RecordType } from '../../lib/record-nouns';
import { type MapExtent, useMapExtent } from '../map/use-map-extent';
import { useFlyToSelection } from './use-fly-to-selection';
import { useMapBoundsParam } from './use-map-bounds-param';
import {
	type MapQueryValue,
	mapQueryParams,
	type PagedMapResource,
	usePagedMapResource,
} from './use-paged-map-resource';
import { useSelectedMapRecord } from './use-selected-map-record';
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
	/**
	 * Why the page holds nothing, for the rail to say so. Read off the extent
	 * the map fetched to frame the same filters, so it costs no request. See
	 * `ExplorerEmptyReason` for the four answers.
	 */
	readonly empty: ExplorerEmptiness;
}

/**
 * One page of a `/map/*` list endpoint, the record the map has selected, and
 * the camera move that follows it.
 *
 * The viewport goes on the wire ahead of the surface's own filters, and nothing
 * is asked for until the map has one. `empty` reads the layer's extent, which
 * the map fetches to frame the same filters, so it costs no extra request.
 */
export function useExplorerResource<TRow extends ExplorerRowShape>({
	path,
	rowsKey,
	rowKey,
	recordType,
	params,
	layer,
	map,
	selectedId,
	normalizeRow,
	holdRailOnSelect = false,
}: {
	/** The list endpoint, e.g. `/map/source-reduction`. Also roots the query key. */
	readonly path: string;
	/** The key the rows arrive under in the response body, e.g. `sourceReductions`. */
	readonly rowsKey: string;
	/** The key one record arrives under, e.g. `sourceReduction`. */
	readonly rowKey: string;
	/** What the page lists. `usePagedMapResource`'s prop carries the rule. */
	readonly recordType: RecordType;
	/** The surface's own filters, before the empties are dropped. */
	readonly params: Readonly<Record<string, MapQueryValue>>;
	/**
	 * The tile layer the map draws for this surface, the same entry `MapCanvas`
	 * frames under `fitToData`. Its extent URL is what the empty state reads,
	 * and the two share one query, so the surface still sends one extent request.
	 */
	readonly layer: MapTileLayer;
	readonly map: MapboxMap | null;
	readonly selectedId: string | null;
	/** Defaults a row's newer fields, where a deployed server may not send them. */
	readonly normalizeRow?: (row: TRow) => TRow;
	/**
	 * Keep the rail's rows when a record is selected. The map still flies to
	 * the record; the page is not re-read for the viewport it lands on.
	 */
	readonly holdRailOnSelect?: boolean;
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
		recordType,
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
		pageSettled: paged.isSettled,
		selectedId,
		...shaping,
	});
	useFlyToSelection(map, selected, holdRailOnSelect);

	const extentUrl = tileLayerExtentUrl(layer);
	const extent = useMapExtent(extentUrl);
	// Waiting on the map counts as loading. The page query is disabled until the
	// map reports a viewport, and a disabled query is not `isLoading`, so a cold
	// map used to read as a settled, empty page for as long as it took to load.
	const isLoading = bbox === null || paged.isLoading || (extentUrl !== null && !extent.isSettled);
	const empty: ExplorerEmptiness = {
		recordType,
		reason: isLoading ? 'loading' : emptyReason(extentUrl, extent),
	};

	return {
		...paged,
		// The rail cannot say why it is empty until the extent has answered, so
		// the placeholders stay up until it has.
		isLoading,
		selected,
		empty,
	};
}

/**
 * Which of the three empty states the extent puts the rail in.
 *
 * Asked only once nothing is loading. A box means matches exist somewhere, so the
 * viewport is what to change. No box means nothing matched anywhere, and then
 * the query string says whether a filter did it: the extent URL carries the
 * surface's filters and nothing else, no `bbox`, no paging, so an empty query
 * is a request for everything the Organization has. A failed request reads as
 * the viewport, which is the copy the rail gave before it could tell, and a
 * layer with no extent endpoint, which none of the nine is, reads the same.
 */
function emptyReason(extentUrl: string | null, extent: MapExtent): ExplorerEmptyReason {
	if (extentUrl === null || extent.isError || extent.extent !== null) {
		return 'viewport';
	}
	return new URL(extentUrl).search.length > 0 ? 'filters' : 'none';
}
