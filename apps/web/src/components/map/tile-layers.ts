/**
 * The twelve vector tilesets a {@link MapCanvas} can draw, in one table.
 *
 * The variation between them was already extracted: `use-tile-layer.ts` owns the
 * whole GL lifecycle and each tileset only supplies a source id, its filter spec,
 * a layer builder and two id lists. What was left was the enumeration itself,
 * written out nine times inside `map-canvas.tsx` and once more per
 * `use-*-tile-layer.ts` wrapper, so a twelfth record kind edited ten files.
 *
 * A row here is one record kind. The `kind` a caller writes in the `layers` list
 * is the key of that row, and it is also the `/map/tiles/:tileset` segment the
 * server answers on: `apps/server/src/map-tiles.ts` holds the same twelve names
 * in `createTileSetRegistry`. `pnpm check:tileset-keys` holds the two lists and
 * the `*_SOURCE_ID` constants to each other, because a name that disagrees 404s
 * every tile and draws an empty map with nothing on screen to say why.
 */

import {
	ADDRESS_MAP_FILTERS,
	BIOCONTROL_MAP_FILTERS,
	CHEMICAL_MAP_FILTERS,
	COLLECTION_MAP_FILTERS,
	HABITAT_MAP_FILTERS,
	INSPECTION_MAP_FILTERS,
	type MapFilterSpec,
	type MapFiltersOf,
	OUTREACH_MAP_FILTERS,
	REGION_MAP_FILTERS,
	SAMPLE_MAP_FILTERS,
	SERVICE_REQUEST_MAP_FILTERS,
	SOURCE_REDUCTION_MAP_FILTERS,
	TRAP_MAP_FILTERS,
} from '@simmer-mosquito/domain';
import { type GeoJsonPoint, isGeoJsonGeometryOfTypes } from '@simmer-mosquito/mapping';
import type { LayerSpecification } from 'mapbox-gl';
import {
	ADDRESS_INTERACTIVE_LAYER_IDS,
	ADDRESS_LAYER_IDS,
	ADDRESS_SOURCE_ID,
	addressTileLayers,
} from './address-tiles';
import {
	BIOCONTROL_INTERACTIVE_LAYER_IDS,
	BIOCONTROL_LAYER_IDS,
	BIOCONTROL_SOURCE_ID,
	biocontrolTileLayers,
} from './biocontrol-tiles';
import {
	CHEMICAL_INTERACTIVE_LAYER_IDS,
	CHEMICAL_LAYER_IDS,
	CHEMICAL_SOURCE_ID,
	chemicalTileLayers,
} from './chemical-tiles';
import {
	COLLECTION_INTERACTIVE_LAYER_IDS,
	COLLECTION_LAYER_IDS,
	COLLECTION_SOURCE_ID,
	collectionTileLayers,
} from './collection-tiles';
import { withSelectedPointFromCutOff } from './geometry-tiles';
import {
	HABITAT_INTERACTIVE_LAYER_IDS,
	HABITAT_LAYER_IDS,
	HABITAT_SOURCE_ID,
	habitatTileLayers,
} from './habitat-tiles';
import {
	INSPECTION_INTERACTIVE_LAYER_IDS,
	INSPECTION_LAYER_IDS,
	INSPECTION_SOURCE_ID,
	inspectionTileLayers,
} from './inspection-tiles';
import {
	OUTREACH_INTERACTIVE_LAYER_IDS,
	OUTREACH_LAYER_IDS,
	OUTREACH_SOURCE_ID,
	outreachTileLayers,
} from './outreach-tiles';
import {
	REGION_INTERACTIVE_LAYER_IDS,
	REGION_LAYER_IDS,
	REGION_SOURCE_ID,
	regionTileLayers,
} from './region-tiles';
import {
	SAMPLE_INTERACTIVE_LAYER_IDS,
	SAMPLE_LAYER_IDS,
	SAMPLE_SOURCE_ID,
	sampleTileLayers,
} from './sample-tiles';
import {
	SERVICE_REQUEST_INTERACTIVE_LAYER_IDS,
	SERVICE_REQUEST_LAYER_IDS,
	SERVICE_REQUEST_SOURCE_ID,
	serviceRequestTileLayers,
} from './service-request-tiles';
import {
	SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS,
	SOURCE_REDUCTION_LAYER_IDS,
	SOURCE_REDUCTION_SOURCE_ID,
	sourceReductionTileLayers,
} from './source-reduction-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';
import {
	TRAP_INTERACTIVE_LAYER_IDS,
	TRAP_LAYER_IDS,
	TRAP_SOURCE_ID,
	trapTileLayers,
} from './trap-tiles';

/** What every entry in the `layers` list carries, whatever kind it is. */
interface TileLayerBase<TFilters> {
	/** Base server URL the tile and extent templates are built against. */
	readonly serverUrl: string;
	/** Server-side filters folded into both requests. */
	readonly filters?: TFilters;
	/** Currently selected record id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a record id on feature click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
	/**
	 * The selected record as the page already holds it, for the selection
	 * overlay a clustered tileset draws. See {@link tileLayerSelectionOverlay}.
	 */
	readonly selectedRecord?: SelectedTileRecord | null;
}

/**
 * What the selection overlay reads off the selected record: which record it is
 * and its stored geometry. Every `/map/*` display row carries both, `geojson`
 * under that name, so an explorer passes its selected row as it is.
 */
interface SelectedTileRecord {
	readonly id: string;
	readonly geojson?: unknown;
}

/** What one tileset supplies so {@link useTileLayer} can draw it. */
interface TileLayerBinding<TLayer, TSpec extends MapFilterSpec = MapFilterSpec> {
	/** The GL source id, which is also the `/map/tiles/:tileset` segment. */
	readonly sourceId: string;
	/**
	 * The spec in `@simmer-mosquito/domain` the server parses this tileset's
	 * filters with. The tile and extent queries are both encoded off it, and the
	 * entry's `filters` are typed off it, so the two cannot name different params.
	 */
	readonly filterSpec: TSpec;
	/** Clickable layers, in hit priority. */
	readonly interactiveLayerIds: readonly string[];
	/** Every layer the tileset owns, for teardown. */
	readonly allLayerIds: readonly string[];
	/**
	 * The server lets this tileset cluster. It mirrors `clusters: true` in
	 * `createTileSetRegistry`, and a tileset without it is never asked to,
	 * because the server answers 400 to the param there. Every row whose records
	 * are points says so, and only Regions does not; `pnpm check:tileset-keys`
	 * holds this set to the server's.
	 */
	readonly clusters?: true;
	/**
	 * The filters the extent is asked for, or null to leave the camera alone.
	 * Without it the extent takes the entry's own filters, which is every row but
	 * Regions.
	 */
	readonly extentFilters?: (layer: TLayer) => MapFiltersOf<TSpec> | null;
	readonly buildLayers: (layer: TLayer) => LayerSpecification[];
}

/**
 * One row of the table. The entry's filters come off the row's spec. `TExtra`
 * is what this kind carries beyond the shared fields, and only Regions has any:
 * a field meaningless for the other eleven on the shared shape is how the next
 * one gets added without an argument. Naming it means naming the spec too,
 * since TypeScript infers all of a call's type arguments or none of them.
 */
function defineTileLayer<const TSpec extends MapFilterSpec, TExtra = unknown>(
	binding: TileLayerBinding<TileLayerBase<MapFiltersOf<TSpec>> & TExtra, TSpec>,
): TileLayerBinding<TileLayerBase<MapFiltersOf<TSpec>> & TExtra, TSpec> {
	return binding;
}

/** Regions stream whole and are hidden client-side, so the ticked set is a layer field. */
interface RegionVisibility {
	/** Region ids to draw; anything not listed stays hidden. Defaults to none. */
	readonly visibleIds?: readonly string[];
}

const EMPTY_IDS: readonly string[] = [];

/**
 * The table. Adding a record kind is one row here, plus the `*-tiles.ts` module
 * it names and a `defineTileSet` on the server.
 */
const TILE_LAYER_BINDINGS = {
	habitats: defineTileLayer({
		sourceId: HABITAT_SOURCE_ID,
		filterSpec: HABITAT_MAP_FILTERS,
		interactiveLayerIds: HABITAT_INTERACTIVE_LAYER_IDS,
		allLayerIds: HABITAT_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => habitatTileLayers(layer.selectedId ?? null),
	}),
	regions: defineTileLayer<typeof REGION_MAP_FILTERS, RegionVisibility>({
		sourceId: REGION_SOURCE_ID,
		filterSpec: REGION_MAP_FILTERS,
		interactiveLayerIds: REGION_INTERACTIVE_LAYER_IDS,
		allLayerIds: REGION_LAYER_IDS,
		// Only the ticked regions are on screen, so the camera frames those and an
		// empty set frames nothing rather than the whole organization.
		extentFilters: (layer) => {
			const ids = layer.visibleIds ?? EMPTY_IDS;
			return ids.length === 0 ? null : { ...layer.filters, ids };
		},
		buildLayers: (layer) =>
			regionTileLayers(layer.selectedId ?? null, layer.visibleIds ?? EMPTY_IDS),
	}),
	addresses: defineTileLayer({
		sourceId: ADDRESS_SOURCE_ID,
		filterSpec: ADDRESS_MAP_FILTERS,
		interactiveLayerIds: ADDRESS_INTERACTIVE_LAYER_IDS,
		allLayerIds: ADDRESS_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => addressTileLayers(layer.selectedId ?? null),
	}),
	inspections: defineTileLayer({
		sourceId: INSPECTION_SOURCE_ID,
		filterSpec: INSPECTION_MAP_FILTERS,
		interactiveLayerIds: INSPECTION_INTERACTIVE_LAYER_IDS,
		allLayerIds: INSPECTION_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => inspectionTileLayers(layer.selectedId ?? null),
	}),
	samples: defineTileLayer({
		sourceId: SAMPLE_SOURCE_ID,
		filterSpec: SAMPLE_MAP_FILTERS,
		interactiveLayerIds: SAMPLE_INTERACTIVE_LAYER_IDS,
		allLayerIds: SAMPLE_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => sampleTileLayers(layer.selectedId ?? null),
	}),
	chemical: defineTileLayer({
		sourceId: CHEMICAL_SOURCE_ID,
		filterSpec: CHEMICAL_MAP_FILTERS,
		interactiveLayerIds: CHEMICAL_INTERACTIVE_LAYER_IDS,
		allLayerIds: CHEMICAL_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => chemicalTileLayers(layer.selectedId ?? null),
	}),
	'source-reduction': defineTileLayer({
		sourceId: SOURCE_REDUCTION_SOURCE_ID,
		filterSpec: SOURCE_REDUCTION_MAP_FILTERS,
		interactiveLayerIds: SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS,
		allLayerIds: SOURCE_REDUCTION_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => sourceReductionTileLayers(layer.selectedId ?? null),
	}),
	biocontrol: defineTileLayer({
		sourceId: BIOCONTROL_SOURCE_ID,
		filterSpec: BIOCONTROL_MAP_FILTERS,
		interactiveLayerIds: BIOCONTROL_INTERACTIVE_LAYER_IDS,
		allLayerIds: BIOCONTROL_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => biocontrolTileLayers(layer.selectedId ?? null),
	}),
	outreach: defineTileLayer({
		sourceId: OUTREACH_SOURCE_ID,
		filterSpec: OUTREACH_MAP_FILTERS,
		interactiveLayerIds: OUTREACH_INTERACTIVE_LAYER_IDS,
		allLayerIds: OUTREACH_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => outreachTileLayers(layer.selectedId ?? null),
	}),
	traps: defineTileLayer({
		sourceId: TRAP_SOURCE_ID,
		filterSpec: TRAP_MAP_FILTERS,
		interactiveLayerIds: TRAP_INTERACTIVE_LAYER_IDS,
		allLayerIds: TRAP_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => trapTileLayers(layer.selectedId ?? null),
	}),
	collections: defineTileLayer({
		sourceId: COLLECTION_SOURCE_ID,
		filterSpec: COLLECTION_MAP_FILTERS,
		interactiveLayerIds: COLLECTION_INTERACTIVE_LAYER_IDS,
		allLayerIds: COLLECTION_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => collectionTileLayers(layer.selectedId ?? null),
	}),
	'service-requests': defineTileLayer({
		sourceId: SERVICE_REQUEST_SOURCE_ID,
		filterSpec: SERVICE_REQUEST_MAP_FILTERS,
		interactiveLayerIds: SERVICE_REQUEST_INTERACTIVE_LAYER_IDS,
		allLayerIds: SERVICE_REQUEST_LAYER_IDS,
		clusters: true,
		buildLayers: (layer) => serviceRequestTileLayers(layer.selectedId ?? null),
	}),
};

type LayerOf<TBinding> = TBinding extends TileLayerBinding<infer TLayer> ? TLayer : never;

/** Which tileset an entry draws. Also the `/map/tiles/:tileset` segment. */
type TileLayerKind = keyof typeof TILE_LAYER_BINDINGS;

/**
 * One entry in a canvas's ordered `layers` list.
 *
 * Earlier entries are added to the map first, so a later one draws over them.
 * Every canvas's own GeoJSON overlay is added after all of them and stays on
 * top.
 */
export type MapTileLayer = {
	[TKind in TileLayerKind]: { readonly kind: TKind } & LayerOf<(typeof TILE_LAYER_BINDINGS)[TKind]>;
}[TileLayerKind];

/** The row for this entry's kind. */
export function tileLayerBinding(layer: MapTileLayer): TileLayerBinding<MapTileLayer> {
	// The row and the entry are correlated by `kind`, and a union lookup is where
	// TypeScript loses that: the parameter types of twelve rows have no common
	// supertype to narrow to. The key comes off the entry itself, so it holds.
	return TILE_LAYER_BINDINGS[layer.kind] as TileLayerBinding<MapTileLayer>;
}

/**
 * The filters this layer's GL specs currently carry, as a value an effect can
 * compare. Reading it off the built specs rather than off a per-tileset list of
 * the fields they depend on is what lets Regions, whose base layers are filtered
 * by the ticked set, share one re-scope effect with the eleven whose are not.
 */
export function tileLayerFilterKey(layer: MapTileLayer, draw: TileDrawOptions): string {
	return JSON.stringify(
		tileLayerSpecs(layer, draw).map((spec) => [spec.filter ?? null, spec.minzoom ?? null]),
	);
}

/** Whether the server lets this layer's tileset cluster. */
export function tileLayerClusters(layer: MapTileLayer): boolean {
	return tileLayerBinding(layer).clusters === true;
}

/**
 * Whether this layer's tiles are drawn clustered: the tileset clusters and the
 * map's clustering setting is on. It is the same test {@link tileLayerTileUrl}
 * puts `cluster=1` on the URL by, so the overlay follows the tiles requested.
 */
function tileLayerDrawsClusters(layer: MapTileLayer, draw: TileDrawOptions): boolean {
	return draw.cluster === true && tileLayerClusters(layer);
}

/**
 * The point the selection overlay draws, or null when it draws nothing.
 *
 * Only a clustered tile folds a record into a cluster, and only a `Point`: the
 * tile query passes every other shape, a `MultiPoint` included, through as
 * itself. So the overlay draws when the tiles cluster, a record is selected, the
 * page holds that record's row, and its geometry is a single point. Anything
 * short of that leaves the tile's own highlight to draw the selection as it
 * always has. The geometry comes back as the row's own object, so the overlay's
 * source data stays the same reference from one render to the next.
 */
export function tileLayerSelectionOverlay(
	layer: MapTileLayer,
	draw: TileDrawOptions,
): GeoJsonPoint | null {
	const record = layer.selectedRecord ?? null;
	if (record === null || record.id !== layer.selectedId) {
		return null;
	}
	if (!isGeoJsonGeometryOfTypes(record.geojson, ['Point'])) {
		return null;
	}
	return tileLayerDrawsClusters(layer, draw) ? record.geojson : null;
}

/**
 * The GL layers this tileset draws right now.
 *
 * The binding's layers, with the tile's selected point limited to the zooms from
 * the cut-off up while the selection overlay is drawing the zooms below it, so
 * the record is never drawn selected twice over.
 */
export function tileLayerSpecs(layer: MapTileLayer, draw: TileDrawOptions): LayerSpecification[] {
	const binding = tileLayerBinding(layer);
	const specs = binding.buildLayers(layer);
	return tileLayerSelectionOverlay(layer, draw) === null
		? specs
		: withSelectedPointFromCutOff(binding.sourceId, specs);
}

/**
 * The tile template for this layer. `draw.cluster` is the map's clustering
 * setting, and it reaches the URL only for a tileset that clusters.
 */
export function tileLayerTileUrl(layer: MapTileLayer, draw: TileDrawOptions): string {
	const binding = tileLayerBinding(layer);
	return tileTemplateUrl(
		layer.serverUrl,
		binding.sourceId,
		bindingFilterQuery(binding, layer.filters),
		{ cluster: tileLayerDrawsClusters(layer, draw) },
	);
}

/** Where this layer's filtered data is, or null when it has none to frame. */
export function tileLayerExtentUrl(layer: MapTileLayer): string | null {
	const binding = tileLayerBinding(layer);
	const filters =
		binding.extentFilters === undefined ? layer.filters : binding.extentFilters(layer);
	return filters === null
		? null
		: tileExtentUrl(layer.serverUrl, binding.sourceId, bindingFilterQuery(binding, filters));
}

/**
 * The extent of every region the Organization has, ticked or not, which is
 * what an explorer frames on a first visit. {@link tileLayerExtentUrl} answers
 * null for a regions entry with nothing ticked, so this is the one way past it.
 */
export function allRegionsExtentUrl(serverUrl: string): string {
	const binding = TILE_LAYER_BINDINGS.regions;
	return tileExtentUrl(serverUrl, binding.sourceId, tileFilterQuery(binding.filterSpec, undefined));
}

/**
 * A row's filters as its query. The spec is named because inferring it from an
 * entry's filters, a union of twelve kinds, picks one kind's spec and refuses
 * the rest. The row and the entry agree by `kind`, which is what
 * {@link tileLayerBinding} already relies on.
 */
function bindingFilterQuery(
	binding: TileLayerBinding<MapTileLayer>,
	filters: MapTileLayer['filters'] | MapFiltersOf<MapFilterSpec>,
): URLSearchParams {
	return tileFilterQuery<MapFilterSpec>(binding.filterSpec, filters);
}
