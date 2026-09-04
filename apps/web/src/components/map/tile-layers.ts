/**
 * The eleven vector tilesets a {@link MapCanvas} can draw, in one table.
 *
 * The variation between them was already extracted: `use-tile-layer.ts` owns the
 * whole GL lifecycle and each tileset only supplies a source id, two URL
 * builders, a layer builder and two id lists. What was left was the enumeration
 * itself, written out nine times inside `map-canvas.tsx` and once more per
 * `use-*-tile-layer.ts` wrapper, so a twelfth record kind edited ten files.
 *
 * A row here is one record kind. The `kind` a caller writes in the `layers` list
 * is the key of that row, and it is also the `/map/tiles/:tileset` segment the
 * server answers on: `apps/server/src/map-tiles.ts` holds the same eleven names
 * in `createTileSetRegistry`. `pnpm check:tileset-keys` holds the two lists and
 * the `*_SOURCE_ID` constants to each other, because a name that disagrees 404s
 * every tile and draws an empty map with nothing on screen to say why.
 */

import type { LayerSpecification } from 'mapbox-gl';
import {
	ADDRESS_INTERACTIVE_LAYER_IDS,
	ADDRESS_LAYER_IDS,
	ADDRESS_SOURCE_ID,
	type AddressTileFilters,
	addressTileLayers,
	buildAddressExtentUrl,
	buildAddressTileUrl,
} from './address-tiles';
import {
	BIOCONTROL_INTERACTIVE_LAYER_IDS,
	BIOCONTROL_LAYER_IDS,
	BIOCONTROL_SOURCE_ID,
	type BiocontrolTileFilters,
	biocontrolTileLayers,
	buildBiocontrolExtentUrl,
	buildBiocontrolTileUrl,
} from './biocontrol-tiles';
import {
	buildChemicalExtentUrl,
	buildChemicalTileUrl,
	CHEMICAL_INTERACTIVE_LAYER_IDS,
	CHEMICAL_LAYER_IDS,
	CHEMICAL_SOURCE_ID,
	type ChemicalTileFilters,
	chemicalTileLayers,
} from './chemical-tiles';
import {
	buildCollectionExtentUrl,
	buildCollectionTileUrl,
	COLLECTION_INTERACTIVE_LAYER_IDS,
	COLLECTION_LAYER_IDS,
	COLLECTION_SOURCE_ID,
	type CollectionTileFilters,
	collectionTileLayers,
} from './collection-tiles';
import {
	buildHabitatExtentUrl,
	buildHabitatTileUrl,
	HABITAT_INTERACTIVE_LAYER_IDS,
	HABITAT_LAYER_IDS,
	HABITAT_SOURCE_ID,
	type HabitatTileFilters,
	habitatTileLayers,
} from './habitat-tiles';
import {
	buildInspectionExtentUrl,
	buildInspectionTileUrl,
	INSPECTION_INTERACTIVE_LAYER_IDS,
	INSPECTION_LAYER_IDS,
	INSPECTION_SOURCE_ID,
	type InspectionTileFilters,
	inspectionTileLayers,
} from './inspection-tiles';
import {
	buildOutreachExtentUrl,
	buildOutreachTileUrl,
	OUTREACH_INTERACTIVE_LAYER_IDS,
	OUTREACH_LAYER_IDS,
	OUTREACH_SOURCE_ID,
	type OutreachTileFilters,
	outreachTileLayers,
} from './outreach-tiles';
import {
	buildRegionExtentUrl,
	buildRegionTileUrl,
	REGION_INTERACTIVE_LAYER_IDS,
	REGION_LAYER_IDS,
	REGION_SOURCE_ID,
	type RegionTileFilters,
	regionTileLayers,
} from './region-tiles';
import {
	buildSampleExtentUrl,
	buildSampleTileUrl,
	SAMPLE_INTERACTIVE_LAYER_IDS,
	SAMPLE_LAYER_IDS,
	SAMPLE_SOURCE_ID,
	type SampleTileFilters,
	sampleTileLayers,
} from './sample-tiles';
import {
	buildSourceReductionExtentUrl,
	buildSourceReductionTileUrl,
	SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS,
	SOURCE_REDUCTION_LAYER_IDS,
	SOURCE_REDUCTION_SOURCE_ID,
	type SourceReductionTileFilters,
	sourceReductionTileLayers,
} from './source-reduction-tiles';
import {
	buildTrapExtentUrl,
	buildTrapTileUrl,
	TRAP_INTERACTIVE_LAYER_IDS,
	TRAP_LAYER_IDS,
	TRAP_SOURCE_ID,
	type TrapTileFilters,
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
}

/** What one tileset supplies so {@link useTileLayer} can draw it. */
interface TileLayerBinding<TLayer> {
	/** The GL source id, which is also the `/map/tiles/:tileset` segment. */
	readonly sourceId: string;
	/** Clickable layers, in hit priority. */
	readonly interactiveLayerIds: readonly string[];
	/** Every layer the tileset owns, for teardown. */
	readonly allLayerIds: readonly string[];
	readonly buildTileUrl: (layer: TLayer) => string;
	/** The extent for these filters, or null to leave the camera alone. */
	readonly buildExtentUrl: (layer: TLayer) => string | null;
	readonly buildLayers: (layer: TLayer) => LayerSpecification[];
}

/**
 * One row of the table. `TExtra` is what this kind carries beyond the four
 * shared fields, and only Regions has any: a field meaningless for the other ten
 * on the shared shape is how the next one gets added without an argument.
 */
function defineTileLayer<TFilters, TExtra = unknown>(
	binding: TileLayerBinding<TileLayerBase<TFilters> & TExtra>,
): TileLayerBinding<TileLayerBase<TFilters> & TExtra> {
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
	habitats: defineTileLayer<HabitatTileFilters>({
		sourceId: HABITAT_SOURCE_ID,
		interactiveLayerIds: HABITAT_INTERACTIVE_LAYER_IDS,
		allLayerIds: HABITAT_LAYER_IDS,
		buildTileUrl: (layer) => buildHabitatTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildHabitatExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => habitatTileLayers(layer.selectedId ?? null),
	}),
	regions: defineTileLayer<RegionTileFilters, RegionVisibility>({
		sourceId: REGION_SOURCE_ID,
		interactiveLayerIds: REGION_INTERACTIVE_LAYER_IDS,
		allLayerIds: REGION_LAYER_IDS,
		buildTileUrl: (layer) => buildRegionTileUrl(layer.serverUrl, layer.filters),
		// Only the ticked regions are on screen, so the camera frames those and an
		// empty set frames nothing rather than the whole agency.
		buildExtentUrl: (layer) => {
			const ids = layer.visibleIds ?? EMPTY_IDS;
			return ids.length === 0
				? null
				: buildRegionExtentUrl(layer.serverUrl, { ...layer.filters, ids });
		},
		buildLayers: (layer) =>
			regionTileLayers(layer.selectedId ?? null, layer.visibleIds ?? EMPTY_IDS),
	}),
	addresses: defineTileLayer<AddressTileFilters>({
		sourceId: ADDRESS_SOURCE_ID,
		interactiveLayerIds: ADDRESS_INTERACTIVE_LAYER_IDS,
		allLayerIds: ADDRESS_LAYER_IDS,
		buildTileUrl: (layer) => buildAddressTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildAddressExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => addressTileLayers(layer.selectedId ?? null),
	}),
	inspections: defineTileLayer<InspectionTileFilters>({
		sourceId: INSPECTION_SOURCE_ID,
		interactiveLayerIds: INSPECTION_INTERACTIVE_LAYER_IDS,
		allLayerIds: INSPECTION_LAYER_IDS,
		buildTileUrl: (layer) => buildInspectionTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildInspectionExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => inspectionTileLayers(layer.selectedId ?? null),
	}),
	samples: defineTileLayer<SampleTileFilters>({
		sourceId: SAMPLE_SOURCE_ID,
		interactiveLayerIds: SAMPLE_INTERACTIVE_LAYER_IDS,
		allLayerIds: SAMPLE_LAYER_IDS,
		buildTileUrl: (layer) => buildSampleTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildSampleExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => sampleTileLayers(layer.selectedId ?? null),
	}),
	chemical: defineTileLayer<ChemicalTileFilters>({
		sourceId: CHEMICAL_SOURCE_ID,
		interactiveLayerIds: CHEMICAL_INTERACTIVE_LAYER_IDS,
		allLayerIds: CHEMICAL_LAYER_IDS,
		buildTileUrl: (layer) => buildChemicalTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildChemicalExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => chemicalTileLayers(layer.selectedId ?? null),
	}),
	'source-reduction': defineTileLayer<SourceReductionTileFilters>({
		sourceId: SOURCE_REDUCTION_SOURCE_ID,
		interactiveLayerIds: SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS,
		allLayerIds: SOURCE_REDUCTION_LAYER_IDS,
		buildTileUrl: (layer) => buildSourceReductionTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildSourceReductionExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => sourceReductionTileLayers(layer.selectedId ?? null),
	}),
	biocontrol: defineTileLayer<BiocontrolTileFilters>({
		sourceId: BIOCONTROL_SOURCE_ID,
		interactiveLayerIds: BIOCONTROL_INTERACTIVE_LAYER_IDS,
		allLayerIds: BIOCONTROL_LAYER_IDS,
		buildTileUrl: (layer) => buildBiocontrolTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildBiocontrolExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => biocontrolTileLayers(layer.selectedId ?? null),
	}),
	outreach: defineTileLayer<OutreachTileFilters>({
		sourceId: OUTREACH_SOURCE_ID,
		interactiveLayerIds: OUTREACH_INTERACTIVE_LAYER_IDS,
		allLayerIds: OUTREACH_LAYER_IDS,
		buildTileUrl: (layer) => buildOutreachTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildOutreachExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => outreachTileLayers(layer.selectedId ?? null),
	}),
	traps: defineTileLayer<TrapTileFilters>({
		sourceId: TRAP_SOURCE_ID,
		interactiveLayerIds: TRAP_INTERACTIVE_LAYER_IDS,
		allLayerIds: TRAP_LAYER_IDS,
		buildTileUrl: (layer) => buildTrapTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildTrapExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => trapTileLayers(layer.selectedId ?? null),
	}),
	collections: defineTileLayer<CollectionTileFilters>({
		sourceId: COLLECTION_SOURCE_ID,
		interactiveLayerIds: COLLECTION_INTERACTIVE_LAYER_IDS,
		allLayerIds: COLLECTION_LAYER_IDS,
		buildTileUrl: (layer) => buildCollectionTileUrl(layer.serverUrl, layer.filters),
		buildExtentUrl: (layer) => buildCollectionExtentUrl(layer.serverUrl, layer.filters),
		buildLayers: (layer) => collectionTileLayers(layer.selectedId ?? null),
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
	// TypeScript loses that: the parameter types of eleven rows have no common
	// supertype to narrow to. The key comes off the entry itself, so it holds.
	return TILE_LAYER_BINDINGS[layer.kind] as TileLayerBinding<MapTileLayer>;
}

/**
 * The filters this layer's GL specs currently carry, as a value an effect can
 * compare. Reading it off the built specs rather than off a per-tileset list of
 * the fields they depend on is what lets Regions, whose base layers are filtered
 * by the ticked set, share one re-scope effect with the ten whose are not.
 */
export function tileLayerFilterKey(layer: MapTileLayer): string {
	const specs = tileLayerBinding(layer).buildLayers(layer);
	return JSON.stringify(specs.map((spec) => spec.filter ?? null));
}

/** Where this layer's filtered data is, or null when it has none to frame. */
export function tileLayerExtentUrl(layer: MapTileLayer): string | null {
	return tileLayerBinding(layer).buildExtentUrl(layer);
}
