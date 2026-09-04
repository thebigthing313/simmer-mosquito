import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import { type MapExtent, readMapExtent } from './map-extent.js';
import { readMapTile } from './map-tile.js';

// --- what a map surface is ---------------------------------------------------
//
// Eleven explorer surfaces — habitats, inspections, samples, traps, collections,
// the four control actions, addresses, regions — answer the same four questions.
// Where are the records in this tile? What area do they cover? Give me a page of
// them. Give me this one. Only the table, the geometry, the projection, and the
// predicates that narrow the set differ; everything around those was written out
// once per surface.
//
// The part that matters is not the repetition but what the repetition hid. Every
// one of those reads must be scoped to the caller's agency and must exclude
// soft-deleted rows (ADR 0008), and the spatial ones must narrow to the tile
// envelope with the index-friendly `&&` before the exact `st_intersects`. That
// predicate was typed by hand eleven times, in three different orders, and
// nothing checked that the twelfth would remember it.
//
// Here a surface declares its table, its alias, its geometry and its filters, and
// the scope comes with the readers. A surface cannot be declared without it.

/** The window a bounding-box read frames, in WGS84. */
export interface MapBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

export interface MapTileInput<TFilters> {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: TFilters;
}

export interface MapFilterInput<TFilters> {
	readonly organizationId: string;
	readonly filters?: TFilters;
}

export interface MapPageInput<TFilters> {
	readonly organizationId: string;
	readonly filters?: TFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface MapBoundsPageInput<TFilters> {
	readonly organizationId: string;
	readonly bounds: MapBounds;
	readonly filters?: TFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface MapByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

/** A page of display rows plus the full count for the current filters. */
export interface MapPageResult<TRow> {
	readonly total: number;
	readonly rows: TRow[];
}

/** The table, geometry, and filters of one map surface. */
export interface MapSurfaceDefinition<TFilters> {
	/** The layer name the client's map style binds to. */
	readonly layer: string;
	/** The from-clause: table + alias, plus any join the predicates reference. */
	readonly from: RawBuilder<unknown>;
	/**
	 * The alias the tenancy and soft-delete predicates are written against — the
	 * record's own table, which is not always the one the geometry comes from.
	 */
	readonly alias: string;
	/**
	 * The geometry the surface projects and tests spatially. Usually the record's
	 * own column; a sample borrows its parent inspection's.
	 */
	readonly geom: RawBuilder<unknown>;
	/** What each tile feature carries besides its geometry. */
	readonly properties: readonly RawBuilder<unknown>[];
	/**
	 * Always-on predicates beyond tenancy and soft delete — what a surface reading
	 * through a join needs to say about the joined row (its own soft delete, its
	 * geometry being present). Not a place for filters.
	 */
	readonly alwaysWhere?: readonly RawBuilder<boolean>[];
	/** The predicates the surface's own filters contribute, or none. */
	readonly filterWhere?: (filters: TFilters | undefined) => RawBuilder<boolean>[];
}

/** The projection the paged-list and by-id readers share. */
export interface MapSurfaceDisplay {
	/** The select list, as one fragment so the two readers cannot drift. */
	readonly columns: RawBuilder<unknown>;
	/** Joins the projection needs beyond the surface's own from-clause. */
	readonly joins?: RawBuilder<unknown>;
	/** The order the explorer's result rail reads in. */
	readonly orderBy: RawBuilder<unknown>;
}

/** The geometry reads every map surface offers. */
export interface MapSurfaceReaders<TFilters> {
	/** One tile's worth of features, narrowed to the tile envelope. */
	getTile(db: DbExecutor, input: MapTileInput<TFilters>): Promise<Uint8Array>;
	/**
	 * The extent of the whole filtered set, ignoring the viewport — what the map
	 * frames on load and after a filter change.
	 */
	getExtent(db: DbExecutor, input: MapFilterInput<TFilters>): Promise<MapExtent | null>;
}

/** The geometry reads plus the row reads a surface with a display projection offers. */
export interface MapRecordSurfaceReaders<TFilters, TRow> extends MapSurfaceReaders<TFilters> {
	/** A filtered, offset-paged window with no viewport bound. */
	listPage(db: DbExecutor, input: MapPageInput<TFilters>): Promise<MapPageResult<TRow>>;
	/** A filtered, offset-paged window inside an explicit bounding box. */
	listByBounds(db: DbExecutor, input: MapBoundsPageInput<TFilters>): Promise<MapPageResult<TRow>>;
	/** One row, or nothing when it is another agency's, deleted, or absent. */
	getById(db: DbExecutor, input: MapByIdInput): Promise<TRow | undefined>;
}

/**
 * The geometry half of a map surface: the tile and the framed extent.
 *
 * Enough on its own for a surface the explorer only draws — addresses and
 * regions are read as rows through their own catalog, not through a display
 * projection. Anything with a result rail wants {@link mapRecordSurface}.
 */
export function mapSurface<TFilters>(
	definition: MapSurfaceDefinition<TFilters>,
): MapSurfaceReaders<TFilters> {
	return {
		async getTile(db, input) {
			return readMapTile(db, {
				z: input.z,
				x: input.x,
				y: input.y,
				layer: definition.layer,
				from: definition.from,
				geom: definition.geom,
				properties: definition.properties,
				where: [
					...surfaceWhere(definition, input.organizationId, input.filters),
					...envelopeWhere(definition.geom),
				],
			});
		},

		async getExtent(db, input) {
			return readMapExtent(db, {
				geom: definition.geom,
				from: definition.from,
				where: surfaceWhere(definition, input.organizationId, input.filters),
			});
		},
	};
}

/**
 * A map surface that also answers with rows: the tile and extent above, plus the
 * paged list its explorer's result rail reads and the single row its detail card
 * opens. All four share one scope and one projection, so a record the map draws
 * and a record the list shows are the same set by construction.
 */
export function mapRecordSurface<TFilters, TRow>(
	definition: MapSurfaceDefinition<TFilters> & { readonly display: MapSurfaceDisplay },
): MapRecordSurfaceReaders<TFilters, TRow> {
	const { display } = definition;
	const joins = display.joins ?? sql``;

	return {
		...mapSurface(definition),

		async listPage(db, input) {
			const result = await sql<TRow & { readonly total: number }>`
				select
					${display.columns},
					count(*) over()::int as "total"
				from ${definition.from}
				${joins}
				where ${sql.join(surfaceWhere(definition, input.organizationId, input.filters), sql` and `)}
				order by ${display.orderBy}
				limit ${input.limit}
				offset ${input.offset}
			`.execute(db);

			return { total: result.rows[0]?.total ?? 0, rows: result.rows };
		},

		async listByBounds(db, input) {
			const result = await sql<TRow & { readonly total: number }>`
				with bounds as (
					select st_makeenvelope(
						${input.bounds.west},
						${input.bounds.south},
						${input.bounds.east},
						${input.bounds.north},
						4326
					) as geom_4326
				)
				select
					${display.columns},
					count(*) over()::int as "total"
				from ${definition.from}
				${joins}
				cross join bounds
				where ${sql.join(
					[
						...surfaceWhere(definition, input.organizationId, input.filters),
						...envelopeWhere(definition.geom),
					],
					sql` and `,
				)}
				order by ${display.orderBy}
				limit ${input.limit}
				offset ${input.offset}
			`.execute(db);

			return { total: result.rows[0]?.total ?? 0, rows: result.rows };
		},

		async getById(db, input) {
			const result = await sql<TRow>`
				select ${display.columns}
				from ${definition.from}
				${joins}
				where ${sql.join(
					[
						sql<boolean>`${column(definition.alias, 'id')} = ${input.id}`,
						...scopeWhere(definition, input.organizationId),
					],
					sql` and `,
				)}
				limit 1
			`.execute(db);

			return result.rows[0];
		},
	};
}

/**
 * Tenancy, soft delete, and whatever else the surface is always narrowed by.
 *
 * Every reader on every surface starts here — that is the whole point of the
 * factory. A read that answered without these would hand one agency another's
 * records, or resurrect rows the agency deleted.
 */
function scopeWhere<TFilters>(
	definition: MapSurfaceDefinition<TFilters>,
	organizationId: string,
): RawBuilder<boolean>[] {
	return [
		sql<boolean>`${column(definition.alias, 'organization_id')} = ${organizationId}`,
		sql<boolean>`${column(definition.alias, 'deleted_at')} is null`,
		...(definition.alwaysWhere ?? []),
	];
}

/** The scope plus the surface's own filters — every read but the by-id one. */
function surfaceWhere<TFilters>(
	definition: MapSurfaceDefinition<TFilters>,
	organizationId: string,
	filters: TFilters | undefined,
): RawBuilder<boolean>[] {
	return [...scopeWhere(definition, organizationId), ...(definition.filterWhere?.(filters) ?? [])];
}

/**
 * Narrow to the `bounds` CTE the tile and bounding-box reads declare.
 *
 * The `&&` bounding-box operator comes first so the GiST index rejects most rows
 * before the exact intersection runs on what is left. Written once here rather
 * than per surface because a tileset that dropped the index test would still
 * return the right features, just slowly enough to be noticed much later.
 */
function envelopeWhere(geom: RawBuilder<unknown>): RawBuilder<boolean>[] {
	return [
		sql<boolean>`${geom} && bounds.geom_4326`,
		sql<boolean>`st_intersects(${geom}, bounds.geom_4326)`,
	];
}

/**
 * An aliased column reference.
 *
 * Raw rather than {@link sql.ref} because the alias and column are literals
 * declared in this package — never caller input — and raw keeps the emitted SQL
 * unquoted and identical to the hand-written readers this replaces.
 */
function column(alias: string, name: string): RawBuilder<unknown> {
	return sql.raw(`${alias}.${name}`);
}
