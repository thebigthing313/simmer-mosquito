import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../auth';
import type {
	ExplorerEmptiness,
	ExplorerEmptyReason,
} from '../../components/explorer/explorer-empty-state';
import { type MapTileLayer, tileLayerExtentUrl } from '../../components/map/tile-layers';
import type { RecordType } from '../../lib/record-nouns';
import { type MapExtent, useMapExtent } from '../map/use-map-extent';
import { type ExplorerSummaryState, useExplorerSummary } from './use-explorer-summary';
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

export interface ExplorerResource<TRow> extends PagedMapResource<TRow>, ExplorerSelection {
	/** The record the map selection points at, on this page or fetched by id. */
	readonly selected: TRow | null;
	/**
	 * Why the page holds nothing, for the rail to say so. Read off the extent
	 * the map fetched to frame the same filters, so it costs no request. See
	 * `ExplorerEmptyReason` for the four answers.
	 */
	readonly empty: ExplorerEmptiness;
	/**
	 * The in-view summary, shown in place of the rows over 100 in view on a
	 * surface that asked for one with `summarize`.
	 */
	readonly summary: ExplorerSummaryState;
	/** What the surface hands `ExplorerCanvas`. */
	readonly canvas: ExplorerCanvasBinding;
}

/**
 * The tileset an explorer draws and the filters it draws under. The hook adds
 * the server URL and the selection, which no route has a second answer for.
 * Regions is not an explorer and is left out, since its layer also carries the
 * ticked set.
 */
export type ExplorerTiles = {
	[TKind in ExplorerTileKind]: Pick<
		Extract<MapTileLayer, { readonly kind: TKind }>,
		'kind' | 'filters'
	>;
}[ExplorerTileKind];

type ExplorerTileKind = Exclude<MapTileLayer['kind'], 'regions'>;

/**
 * What `ExplorerCanvas` needs off the hook: the layers to draw, the callback
 * the canvas hands its map to, and the card's record with the way to shut it.
 */
export interface ExplorerCanvasBinding {
	/**
	 * The `layers` list for `MapCanvas`: the surface's tile layer, carrying the
	 * selected record, so a clustered tileset draws the record over the cluster
	 * that holds it. See `tileLayerSelectionOverlay`.
	 */
	readonly layers: readonly MapTileLayer[];
	/** `MapCanvas`'s `onMapReady`. Nothing is asked for until it has been called. */
	readonly onMapReady: (map: MapboxMap) => void;
	/** The record the card is for, or null when nothing is selected. */
	readonly selectedRecordId: string | null;
	readonly clearSelection: () => void;
}

interface ExplorerSelection {
	/**
	 * What the rail or the map picked. `canvas.selectedRecordId` is the same id
	 * once the record has been read, which is when the card mounts.
	 */
	readonly selectedId: string | null;
	/** Pick a record, or pass null to clear. A map click on empty ground passes null. */
	readonly setSelectedId: (id: string | null) => void;
}

/**
 * One page of a `/map/*` list endpoint, the record the map has selected, and
 * the camera move that follows it.
 *
 * The hook holds the map the canvas reports, the selection and the tile layer,
 * so a route hands it a tileset and filters and renders `ExplorerCanvas` with
 * what comes back. The viewport goes on the wire ahead of the surface's own
 * filters, and nothing is asked for until the map has one. `empty` reads the
 * layer's extent, which the map fetches to frame the same filters, so it costs
 * no extra request.
 */
export function useExplorerResource<TRow extends ExplorerRowShape>({
	path,
	rowsKey,
	rowKey,
	recordType,
	params,
	tiles,
	normalizeRow,
	holdRailOnSelect = false,
	summarize = false,
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
	 * The tileset and filters the map draws for this surface. The layer built
	 * from them is the entry `MapCanvas` frames under `fitToData`, its extent URL
	 * is what the empty state reads, and the two share one query, so the surface
	 * still sends one extent request.
	 */
	readonly tiles: ExplorerTiles;
	/** Defaults a row's newer fields, where a deployed server may not send them. */
	readonly normalizeRow?: (row: TRow) => TRow;
	/**
	 * Keep the rail's rows when a record is selected. The map still flies to
	 * the record; the page is not re-read for the viewport it lands on.
	 */
	readonly holdRailOnSelect?: boolean;
	/**
	 * Read `{path}/summary` once the page counts more than fit on it. Only a
	 * surface whose server declares a summary passes it.
	 */
	readonly summarize?: boolean;
}): ExplorerResource<TRow> {
	// Held here rather than by the route, which only ever handed it back.
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const layer: MapTileLayer = {
		...tiles,
		serverUrl: getServerUrl(),
		selectedId,
		onSelectFeature: setSelectedId,
	};
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
	// The one camera move a selection makes. A card does not fly as well (#1423).
	useFlyToSelection(map, selected, holdRailOnSelect);
	const summary = useExplorerSummary({
		path,
		recordType,
		params: query,
		total: paged.total,
		pageSettled: paged.isSettled,
		enabled: summarize,
	});

	const extentUrl = tileLayerExtentUrl(layer);
	const extent = useMapExtent(extentUrl);
	// Waiting on the map counts as loading. The page query is disabled until the
	// map reports a viewport, and a disabled query is not `isLoading`, so a cold
	// map used to read as a settled, empty page for as long as it took to load.
	const isLoading = bbox === null || paged.isLoading || (extentUrl !== null && !extent.isSettled);
	const layers: readonly MapTileLayer[] = [{ ...layer, selectedRecord: selected }];
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
		summary,
		selectedId,
		setSelectedId,
		canvas: {
			layers,
			onMapReady: setMap,
			selectedRecordId: selected === null ? null : selected.id,
			clearSelection: () => setSelectedId(null),
		},
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
