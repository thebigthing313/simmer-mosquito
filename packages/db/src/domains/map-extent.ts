import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';

// --- filtered map extents ---------------------------------------------------
//
// Every explorer map streams vector tiles for the current viewport, which means
// the client can only ever see what it already framed. To open on the records a
// filter actually selects — and to reframe when the filter changes — the camera
// needs the extent of the *whole* filtered set, so this read is deliberately not
// viewport-bounded. It reuses each tileset's filter predicates minus the tile
// envelope, so the framed extent and the drawn tiles can never disagree.

/** The WGS84 bounding box of a filtered record set. */
export interface MapExtent {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

/** The from-clause, geometry expression, and predicates of one extent read. */
export interface MapExtentQuery {
	/** The geometry column to aggregate, e.g. ``sql`h.geom` ``. */
	readonly geom: RawBuilder<unknown>;
	/** The from-clause: table + alias, plus any join the predicates reference. */
	readonly from: RawBuilder<unknown>;
	/** Tenancy + filter predicates. Must not reference a tile-envelope CTE. */
	readonly where: readonly RawBuilder<boolean>[];
}

/**
 * Aggregate the extent of every row matching `where`. Null when nothing matches
 * or the matches carry no geometry — callers read that as "leave the camera
 * where it is" rather than framing an empty world.
 */
export async function readMapExtent(
	db: Kysely<SimmerDatabase>,
	query: MapExtentQuery,
): Promise<MapExtent | null> {
	const result = await sql<{
		readonly west: number | null;
		readonly south: number | null;
		readonly east: number | null;
		readonly north: number | null;
	}>`
		with extent as (
			select st_extent(${query.geom}) as box
			from ${query.from}
			where ${sql.join([...query.where], sql` and `)}
		)
		select
			st_xmin(box) as "west",
			st_ymin(box) as "south",
			st_xmax(box) as "east",
			st_ymax(box) as "north"
		from extent
	`.execute(db);

	const row = result.rows[0];
	if (
		row === undefined ||
		row.west === null ||
		row.south === null ||
		row.east === null ||
		row.north === null
	) {
		return null;
	}

	return { west: row.west, south: row.south, east: row.east, north: row.north };
}
