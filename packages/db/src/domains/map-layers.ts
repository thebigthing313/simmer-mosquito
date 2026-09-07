// --- the eleven layer names --------------------------------------------------
//
// `/map/tiles/:tileset/{z}/{x}/{y}.mvt` carries a tileset name in the path, and
// that name is also the layer inside the vector tile the client's style draws.
// Three lists spell those eleven strings: the `layer` each surface here
// declares, the keys `apps/server` registers tilesets under, and
// `TILE_LAYER_BINDINGS` in `apps/web`. A name that disagrees answers 200 with a
// layer the style does not draw, so the map is an empty basemap with nothing on
// screen or in the console to say why.
//
// This union closes the db-to-server half at compile time, as membership. A
// surface cannot declare a layer that is not here, and the server's registry is
// a `Record<MapTilesetLayer, ...>`, so a tileset cannot be missing, doubled or
// misspelled either. `pnpm check:tileset-keys` reads all three lists as text,
// which is what reaches `apps/web`: it has no dependency on this package, and
// giving the browser app an edge to the Kysely package to type eleven strings is
// a worse trade than a regex. Neither catches two surfaces trading layers, since
// both names stay spelled everywhere; the gate's header says so.
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
