// --- the eleven layer names --------------------------------------------------
//
// `/map/tiles/:tileset/{z}/{x}/{y}.mvt` carries a tileset name in the path, and
// that name is also the layer inside the vector tile the client's style draws.
// Three registers spell those eleven strings: the `layer` each surface here
// declares, the keys `apps/server` registers tilesets under, and
// `TILE_LAYER_BINDINGS` in `apps/web`. A name that disagrees answers 200 with a
// layer the style does not draw, so the map is an empty basemap with nothing on
// screen or in the console to say why.
//
// This union closes the db-to-server half at compile time. A surface cannot
// declare a layer that is not here, and the server's registry is a
// `Record<MapTilesetLayer, ...>`, so a tileset cannot be missing, doubled or
// misspelled either. `pnpm check:tileset-keys` closes the rest, which the
// compiler cannot reach: `apps/web` holds its own register and imports nothing
// from here, and no compiler notices a surface whose layer is a real name
// belonging to a different surface.
//
// A type rather than an `as const` array because nothing reads these at
// runtime. The two files that spell one write a literal the compiler narrows
// against, which is the check; a value would add an import to every one of them
// and check no more.

/** The `:tileset` path segment, and the layer name inside the tile it answers. */
export type MapTilesetLayer =
	| 'habitats'
	| 'regions'
	| 'addresses'
	| 'inspections'
	| 'samples'
	| 'chemical'
	| 'source-reduction'
	| 'biocontrol'
	| 'outreach'
	| 'traps'
	| 'collections';
