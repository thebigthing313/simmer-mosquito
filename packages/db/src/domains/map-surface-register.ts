import { collectionSurface, trapSurface } from './adult-surveillance.js';
import {
	applicationSurface,
	biocontrolSurface,
	outreachSurface,
	sourceReductionSurface,
} from './control-operations-map.js';
import { addressSurface, regionSurface } from './foundation-geography.js';
import { habitatSurface } from './habitats.js';
import { inspectionSurface, sampleSurface } from './larval-surveillance.js';
import type { MapTilesetLayer } from './map-layers.js';
import type { MapSurfaceReaders } from './map-surface.js';

// --- the eleven map surfaces, keyed by the layer they answer on --------------
//
// One entry per tileset name, over the surface that answers it. `apps/server`
// reads the four readers of an entry straight off this, so the tile route, the
// extent route, the paged route and the by-id route of one explorer are the same
// surface object by construction.
//
// This replaced 84 names that carried no behaviour: 40 exported functions whose
// whole body was one delegation to a surface, and 44 type aliases that were the
// shared `Map*Input` shapes under a per-surface name. Every reference to the 40
// outside this package landed in `apps/server/src/map-tiles.ts`, which then put
// 22 of them back together into the eleven tilesets they came from (#772).
//
// The keys are {@link MapTilesetLayer}, so the compiler refuses a key that is
// not a tileset name and demands every one that is. Each surface is *handed* its
// key as the layer it stamps into its tiles, which is why no surface writes a
// `layer:` literal any more: the name a tile carries and the path it is served
// on cannot be two different strings (#644). What is still unstated is the
// pairing of a table to a key, so two surfaces could trade entries here and both
// names would stay spelled everywhere; `check:tileset-keys`, whose header says
// so, is what holds this register to the server's registry and the client's.
//
// A surface is built once, at module load, the way each was before. The zone one
// of them reads is not a build-time fact: the collections surface takes it off
// every input and caches a definition per zone behind that.

/**
 * A surface declaration waiting for its layer.
 *
 * `never` for the filters because this constraint says only "these are surfaces
 * on eleven layers": the precise filter and row types of each entry are what
 * `satisfies`-style inference keeps, through {@link MapSurfaceOf} below, and are
 * what a caller reading `MAP_SURFACES.collections.listPage` gets.
 */
type MapSurfaceFactory = (layer: MapTilesetLayer) => MapSurfaceReaders<never>;

/** The readers one factory declares, kept per entry rather than widened. */
type MapSurfaceOf<TFactory> = TFactory extends (layer: MapTilesetLayer) => infer TReaders
	? TReaders
	: never;

/**
 * Hand every surface the key it is registered under.
 *
 * The two assertions are `Object.entries` losing the key literals and giving
 * them back; the register's own types come from `T`, so nothing here widens what
 * a caller sees.
 */
function buildMapSurfaces<TFactories extends Record<MapTilesetLayer, MapSurfaceFactory>>(
	factories: TFactories,
): { readonly [TLayer in keyof TFactories]: MapSurfaceOf<TFactories[TLayer]> } {
	const surfaces: Record<string, unknown> = {};
	for (const [layer, build] of Object.entries(factories)) {
		surfaces[layer] = build(layer as MapTilesetLayer);
	}

	return surfaces as { readonly [TLayer in keyof TFactories]: MapSurfaceOf<TFactories[TLayer]> };
}

/** Every map surface, keyed by the `/map/tiles/:tileset` segment it answers on. */
export const MAP_SURFACES = buildMapSurfaces({
	habitats: habitatSurface,
	regions: regionSurface,
	addresses: addressSurface,
	inspections: inspectionSurface,
	samples: sampleSurface,
	chemical: applicationSurface,
	'source-reduction': sourceReductionSurface,
	biocontrol: biocontrolSurface,
	outreach: outreachSurface,
	traps: trapSurface,
	collections: collectionSurface,
});
