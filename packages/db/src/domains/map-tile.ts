import { MAP_CLUSTER_UNTIL_ZOOM } from '@simmer-mosquito/mapping';
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

/**
 * The two numbers every tileset encodes at.
 *
 * Exported so that a test asking what `ST_AsMVTGeom` does to a geometry asks it
 * at the values the map runs on rather than at a copy of them.
 */
export const MAP_TILE_ENCODING = {
	extent: 4096,
	buffer: 64,
} as const;

/**
 * How a tileset that clusters its points groups them.
 *
 * A point is grouped by the grid cell it falls in, `cellSize` units square on
 * the `MAP_TILE_ENCODING.extent` grid, and only below `untilZoom`. 512 is an
 * eighth of the tile, about 64 screen pixels on a 512-pixel tile: on the prod
 * clone's 417 traps it draws 72 features at zoom 10 and 184 at zoom 11, where
 * 256 draws 184 and 294, which leaves circles too close together to read a
 * count off. It divides the extent, so the grid runs on unbroken across a seam
 * and a cell never straddles two tiles. The cut-off zoom is `packages/mapping`'s,
 * since the client fits a cluster to it.
 *
 * Shared by every tileset for the reason the encoding is: a tileset clustering
 * on its own grid would group the same records differently on two maps.
 */
export const MAP_TILE_CLUSTERING = {
	cellSize: 512,
	untilZoom: MAP_CLUSTER_UNTIL_ZOOM,
} as const;

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
	/**
	 * Group points by grid cell below {@link MAP_TILE_CLUSTERING}'s cut-off zoom.
	 * Lines and polygons are drawn as they are either way.
	 */
	readonly cluster?: boolean | undefined;
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
	const clustered = query.cluster === true && query.z < MAP_TILE_CLUSTERING.untilZoom;
	const result = await (clustered ? clusteredTile(query) : unclusteredTile(query)).execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

type TileResult = { readonly tile: Uint8Array | null };

/** The tile with every row drawn as itself. */
function unclusteredTile(query: MapTileQuery): RawBuilder<TileResult> {
	return sql<TileResult>`
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
					extent => ${MAP_TILE_ENCODING.extent},
					buffer => ${MAP_TILE_ENCODING.buffer}
				) as geom
			from ${query.from}
			cross join bounds
			where ${sql.join([...query.where], sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, ${query.layer}::text, ${MAP_TILE_ENCODING.extent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`;
}

/**
 * The tile with its points grouped by grid cell.
 *
 * Three things here are not obvious from the SQL.
 *
 * A point counts toward a cluster only in the tile that owns it. The envelope
 * test is closed, so a point on a seam is selected by both tiles, which reads
 * fine when each draws it and would count it twice in two clusters. Ownership
 * is half-open, west and north edges in and east and south out, and it is
 * tested in the same WGS84 frame the envelope test is, so every point either
 * tile selects belongs to exactly one of them. The tile that does not own a
 * seam point still draws it as itself, the way a plain tile does, so its circle
 * is not cut in half at the edge.
 *
 * The rows are read twice, once for the cells and once for the records that
 * stay themselves. A single read would have to carry the record's properties
 * through a CTE beside the cell columns, and `ST_AsMVT` writes every column it
 * is handed into the feature, so a lone point would arrive with its cell index
 * on it. The cells read selects geometry alone.
 *
 * A cluster row carries one literal null per record property, so both halves
 * of the union have the same columns without this module knowing their names,
 * and Postgres types each null from the record half. The expressions are never
 * evaluated for a cluster: one like a `case` with an `else` would answer with a
 * value over no row and put it on every cluster. `ST_AsMVT` writes no property
 * for a null, so a cluster carries none of the record's and a record none of
 * the cluster's.
 */
function clusteredTile(query: MapTileQuery): RawBuilder<TileResult> {
	const { extent, buffer } = MAP_TILE_ENCODING;
	const { cellSize } = MAP_TILE_CLUSTERING;
	const lastCell = extent / cellSize - 1;
	const point3857 = sql`st_transform(${query.geom}, 3857)`;
	const point4326 = sql`st_transform(${query.geom}, 4326)`;
	// The grid is measured from the envelope's north-west corner, the way tile
	// coordinates are, and clamped so rounding at an edge cannot open a ninth cell.
	const cellX = sql`least(${lastCell}, greatest(0, floor(
		(st_x(${point3857}) - st_xmin(bounds.geom_3857))
		/ (st_xmax(bounds.geom_3857) - st_xmin(bounds.geom_3857))
		* ${extent} / ${cellSize}
	)))::int`;
	const cellY = sql`least(${lastCell}, greatest(0, floor(
		(st_ymax(bounds.geom_3857) - st_y(${point3857}))
		/ (st_ymax(bounds.geom_3857) - st_ymin(bounds.geom_3857))
		* ${extent} / ${cellSize}
	)))::int`;
	const isPoint = sql<boolean>`geometrytype(${query.geom}) = 'POINT'`;
	const ownedHere = sql<boolean>`(
		st_x(${point4326}) >= st_xmin(bounds.geom_4326)
		and st_x(${point4326}) < st_xmax(bounds.geom_4326)
		and st_y(${point4326}) > st_ymin(bounds.geom_4326)
		and st_y(${point4326}) <= st_ymax(bounds.geom_4326)
	)`;
	const where = sql.join([...query.where], sql` and `);
	const properties = sql.join([...query.properties], sql`, `);
	const noProperties = sql.join(
		query.properties.map(() => sql`null`),
		sql`, `,
	);

	return sql<TileResult>`
		with
		bounds as (
			select
				st_tileenvelope(${query.z}, ${query.x}, ${query.y}) as geom_3857,
				st_transform(st_tileenvelope(${query.z}, ${query.x}, ${query.y}), 4326) as geom_4326
		),
		cluster_points as (
			select
				${cellX} as cell_x,
				${cellY} as cell_y,
				${point3857} as point_3857,
				${point4326} as point_4326
			from ${query.from}
			cross join bounds
			where ${where} and ${isPoint} and ${ownedHere}
		),
		cluster_cells as (
			select
				cell_x,
				cell_y,
				count(*)::int as point_count,
				st_setsrid(st_makepoint(avg(st_x(point_3857)), avg(st_y(point_3857))), 3857) as centre,
				min(st_x(point_4326)) as west,
				min(st_y(point_4326)) as south,
				max(st_x(point_4326)) as east,
				max(st_y(point_4326)) as north
			from cluster_points
			group by cell_x, cell_y
			having count(*) > 1
		),
		tile_rows as (
			select
				${properties},
				st_asmvtgeom(
					${point3857},
					bounds.geom_3857,
					extent => ${extent},
					buffer => ${buffer}
				) as geom,
				null::boolean as cluster,
				null::int as point_count,
				null::float8 as cluster_west,
				null::float8 as cluster_south,
				null::float8 as cluster_east,
				null::float8 as cluster_north
			from ${query.from}
			cross join bounds
			where ${where} and (
				not ${isPoint}
				or not ${ownedHere}
				or not exists (
					select 1 from cluster_cells
					where cluster_cells.cell_x = ${cellX} and cluster_cells.cell_y = ${cellY}
				)
			)
			union all
			select
				${noProperties},
				st_asmvtgeom(
					cluster_cells.centre,
					bounds.geom_3857,
					extent => ${extent},
					buffer => ${buffer}
				) as geom,
				true as cluster,
				cluster_cells.point_count,
				cluster_cells.west,
				cluster_cells.south,
				cluster_cells.east,
				cluster_cells.north
			from cluster_cells
			cross join bounds
		)
		select coalesce(st_asmvt(tile_rows, ${query.layer}::text, ${extent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`;
}
