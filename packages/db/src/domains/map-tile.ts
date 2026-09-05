import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';

// --- authenticated vector tiles ---------------------------------------------
//
// Every explorer map streams its records as Mapbox vector tiles. The query is
// the same shape in all eleven tilesets: frame the tile, clip each row's
// geometry to it, and encode the result as one layer. Only the table, the
// geometry column, the properties a feature carries, and the predicates that
// narrow the set differ — this module owns the rest.
//
// The extent and buffer are part of that shared shape rather than per-tileset
// tuning: 4096 is the resolution the client's style expects, and a 64-unit
// buffer is what keeps a symbol straddling a tile seam from being clipped in
// half. A tileset that disagreed with the others here would render visibly
// wrong, so there is one value.

const TILE_EXTENT = 4096;
const TILE_BUFFER = 64;

/** The table, geometry, properties, and predicates of one tile read. */
export interface MapTileQuery {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	/** The layer name the client's map style binds to. */
	readonly layer: string;
	/** The from-clause: table + alias, plus any join the predicates reference. */
	readonly from: RawBuilder<unknown>;
	/** The geometry column to encode, e.g. ``sql`h.geom` ``. */
	readonly geom: RawBuilder<unknown>;
	/** What each feature carries besides its geometry, e.g. ``sql`h.id` ``. */
	readonly properties: readonly RawBuilder<unknown>[];
	/**
	 * Organization-scope, filter, and tile-envelope predicates.
	 *
	 * These may reference the `bounds` CTE this read declares — the envelope
	 * intersection is written by the caller rather than added here because the
	 * same predicate list is reused by the bounding-box list reads, which frame
	 * `bounds` from an explicit box instead of a tile.
	 */
	readonly where: readonly RawBuilder<boolean>[];
}

/**
 * Encode one tile's worth of rows.
 *
 * Returns an empty buffer rather than null when nothing matches: a tile with no
 * features is a valid answer the client caches, and a 404 would make the map
 * retry a viewport that is genuinely empty.
 */
export async function readMapTile(
	db: Kysely<SimmerDatabase>,
	query: MapTileQuery,
): Promise<Uint8Array> {
	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		bounds as (
			select
				st_tileenvelope(${query.z}, ${query.x}, ${query.y}) as geom_3857,
				st_transform(st_tileenvelope(${query.z}, ${query.x}, ${query.y}), 4326) as geom_4326
		),
		tile_rows as (
			select
				${sql.join([...query.properties], sql`, `)},
				st_asmvtgeom(
					st_transform(${query.geom}, 3857),
					bounds.geom_3857,
					extent => ${TILE_EXTENT},
					buffer => ${TILE_BUFFER}
				) as geom
			from ${query.from}
			cross join bounds
			where ${sql.join([...query.where], sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, ${query.layer}::text, ${TILE_EXTENT}, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}
