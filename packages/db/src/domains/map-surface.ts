import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import { type MapExtent, readMapExtent } from './map-extent.js';
import type { MapTilesetLayer } from './map-layers.js';
import { readMapTile } from './map-tile.js';

// --- what a map surface is ---------------------------------------------------
//
// Twelve explorer surfaces — habitats, inspections, samples, traps, collections,
// the four control actions, addresses, regions, service requests — answer the
// same four questions.
// Where are the records in this tile? What area do they cover? Give me a page of
// them. Give me this one. Only the table, the geometry, the projection, and the
// predicates that narrow the set differ; everything around those was written out
// once per surface.
//
// The part that matters is not the repetition but what the repetition hid.
// Every one of those reads must be scoped to the caller's organization and must
// exclude soft-deleted rows (ADR 0008), and the spatial ones must narrow to the
// tile envelope with the index-friendly `&&` before the exact `st_intersects`.
// That predicate was typed by hand eleven times, in three different orders, and
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

/**
 * What every map read is scoped and dated by, whatever it answers with.
 *
 * The zone is on all five inputs whether or not the surface reading one needs
 * it, which is what lets one surface object serve every reader: the surfaces
 * that need it are the ones dated by a `timestamptz`, and which those are is a
 * fact about the schema rather than about this file. The collections surface is
 * the one that reads it today, and it is built per zone because the zone decides
 * both which rows fall in a window and the order the rail reads them in.
 *
 * A per-surface input shape was the alternative, and it cost a `Map` of surfaces
 * keyed by zone plus a UTC default standing in for "no zone needed" on the one
 * read that makes no zone-dependent decision.
 */
export interface MapReadContext {
	readonly organizationId: string;
	/** The organization's IANA timezone, from `AuthContext`. */
	readonly timeZone: string;
}

export interface MapTileInput<TFilters> extends MapReadContext {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly filters?: TFilters;
	/** Group points by grid cell below the cut-off zoom; see `MAP_TILE_CLUSTERING`. */
	readonly cluster?: boolean;
}

export interface MapFilterInput<TFilters> extends MapReadContext {
	readonly filters?: TFilters;
}

export interface MapBoundsPageInput<TFilters> extends MapReadContext {
	readonly bounds: MapBounds;
	readonly filters?: TFilters;
	readonly limit: number;
	readonly offset: number;
}

/** The box and filters of a page, without the paging: what the summary counts. */
export type MapBoundsSummaryInput<TFilters> = Omit<
	MapBoundsPageInput<TFilters>,
	'limit' | 'offset'
>;

export interface MapByIdInput extends MapReadContext {
	readonly id: string;
}

/** A page of display rows plus the full count for the current filters. */
export interface MapPageResult<TRow> {
	readonly total: number;
	readonly rows: TRow[];
}

/** One value of a grouping and how many records in the box carry it. */
export interface MapSummaryGroup {
	/** The grouping expression's value: an id, a flag, or null where the record has none. */
	readonly value: string | boolean | null;
	readonly count: number;
}

/**
 * The records in a box counted, whole and by each grouping the surface declares.
 *
 * Every declared grouping is a key, an empty list when the box holds nothing,
 * and each list runs largest count first.
 */
export interface MapSummaryResult {
	readonly total: number;
	readonly groups: Readonly<Record<string, readonly MapSummaryGroup[]>>;
	/**
	 * Each declared figure over the box. Absent on a surface that declares none,
	 * and a `max` figure is absent from it when no record in the box carries one.
	 */
	readonly figures?: Readonly<Record<string, number>>;
}

/**
 * A grouping that files one record under several values: the expression is an
 * array, and the record counts once under each value in it. A sample carrying
 * two species is counted under both, so the counts can add up to more than
 * the total.
 */
export interface MapSummaryGroupingEach {
	readonly each: RawBuilder<readonly unknown[]>;
}

/**
 * The groupings a surface's summary counts by, each a named SQL expression over
 * the surface's from-clause, or an array of values under `each`.
 *
 * A function of the read context for the reason `filterWhere` is one: the
 * habitats surface groups by its untreated predicate, whose window ends on the
 * organization's today.
 */
export type MapSurfaceGroupings = (
	context: MapReadContext,
) => Readonly<Record<string, RawBuilder<unknown> | MapSummaryGroupingEach>>;

/**
 * A figure read as the largest value over the box rather than the sum: the
 * expression is null on a record that has no value, and the figure is left out
 * when no record has one. How long the oldest open service request has waited
 * is the case, where a sum of ages means nothing and zero would read as a
 * request received today.
 */
export interface MapSummaryFigureMax {
	readonly max: RawBuilder<number | null>;
}

/**
 * The figures a surface's summary adds up, each a named numeric expression per
 * record, summed over the box, or the largest of them under `max`.
 */
export type MapSurfaceFigures = (
	context: MapReadContext,
) => Readonly<Record<string, RawBuilder<number> | MapSummaryFigureMax>>;

/** The table, geometry, and filters of one map surface. */
export interface MapSurfaceDefinition<TFilters> {
	/**
	 * The layer name the client's map style binds to, and the `:tileset` segment
	 * the server answers it on.
	 *
	 * Not written beside a surface: `MAP_SURFACES` in `map-surface-register.ts`
	 * hands each surface the key it is registered under, so the name a tile
	 * carries and the path it is served on are one literal. Narrowed to
	 * {@link MapTilesetLayer} on top of that, so nothing else can pass a string
	 * the server does not register.
	 */
	readonly layer: MapTilesetLayer;
	/** The from-clause: table + alias, plus any join the predicates reference. */
	readonly from: RawBuilder<unknown>;
	/**
	 * The alias the organization and soft-delete predicates are written against —
	 * the record's own table, which is not always the one the geometry comes
	 * from.
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
	 * Always-on predicates beyond organization scope and soft delete — what a
	 * surface reading through a join needs to say about the joined row (its own
	 * soft delete, its geometry being present). Not a place for filters.
	 */
	readonly alwaysWhere?: readonly RawBuilder<boolean>[];
	/**
	 * The predicates the surface's own filters contribute, or none.
	 *
	 * The read context rides along for the one filter whose predicate is a
	 * question about today: the habitats surface's `untreated`, whose window is
	 * the rolling week ending on the organization's day, which only the zone can
	 * name. A filter over a stored column ignores it.
	 */
	readonly filterWhere?: (
		filters: TFilters | undefined,
		context: MapReadContext,
	) => RawBuilder<boolean>[];
}

/**
 * The select list of a display projection: one expression per field of the row,
 * keyed by the alias it is selected under.
 *
 * A record rather than one opaque fragment because the alias is the only part of
 * the projection the row type can be held to. Written as SQL text it is a string
 * inside a template literal and the `sql<TRow>` cast is an assertion nothing
 * checks; written as a key it is `keyof TRow`, so a mapped type over the row
 * makes the compiler demand every field and refuse every extra. Three of the
 * nine surfaces had drifted by the time anyone counted (#620), all of them
 * selecting a column the row type did not declare.
 *
 * The expression stays an expression. A `case`, a `coalesce` roll-up and a
 * `::text` cast are all values here; only the alias moved into the type.
 */
export type MapDisplayColumns<TRow> = {
	readonly [TAlias in keyof TRow & string]: RawBuilder<unknown>;
};

/** The projection the paged-list and by-id readers share. */
export interface MapSurfaceDisplay<TRow, TFilters = unknown> {
	/** The select list, keyed by alias, so the row type and the SQL cannot drift. */
	readonly columns: MapDisplayColumns<TRow>;
	/** Joins the projection needs beyond the surface's own from-clause. */
	readonly joins?: RawBuilder<unknown>;
	/**
	 * The order the explorer's result rail reads in, or a function of the
	 * filters for a surface whose rail offers more than one. Only the paged read
	 * asks it; the tile, the extent and the by-id read have no order.
	 */
	readonly orderBy: RawBuilder<unknown> | ((filters: TFilters | undefined) => RawBuilder<unknown>);
}

/**
 * A declared projection as a select list.
 *
 * Every entry is emitted as `expression as "alias"`, quoted, including the ones
 * whose expression is already the column of that name. Uniform rather than
 * clever: the alias in the SQL is then the same string as the key in the type,
 * with nothing inferring one from the other.
 *
 * The alias is raw for the reason {@link column} is: these are literals declared
 * in this package, never caller input.
 */
export function mapDisplaySelectList<TRow>(columns: MapDisplayColumns<TRow>): RawBuilder<unknown> {
	const entries = Object.entries(columns as Record<string, RawBuilder<unknown>>);
	return sql.join(
		entries.map(([alias, expression]) => sql`${expression} as ${sql.raw(`"${alias}"`)}`),
		sql`, `,
	);
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
	/**
	 * A filtered, offset-paged window inside an explicit bounding box.
	 *
	 * The only paged read a surface offers. `listPage` stood beside it and
	 * answered the same question with no box, which six explorers read while
	 * their maps drew the viewport, so the rail and the map showed different
	 * sets; it went when the last of the six flipped (#920).
	 */
	listByBounds(db: DbExecutor, input: MapBoundsPageInput<TFilters>): Promise<MapPageResult<TRow>>;
	/**
	 * The same box and filters as {@link listByBounds}, counted rather than
	 * paged: the total, and the count per value of each declared grouping.
	 *
	 * Both reads narrow with one predicate, so the summary's total is the
	 * page's total for the same request, which is the rule #920 set for a rail
	 * and the map beside it.
	 */
	summarizeByBounds(
		db: DbExecutor,
		input: MapBoundsSummaryInput<TFilters>,
	): Promise<MapSummaryResult>;
	/** One row, or nothing when it is another organization's, deleted, or absent. */
	getById(db: DbExecutor, input: MapByIdInput): Promise<TRow | undefined>;
}

/**
 * The geometry half of a map surface: the tile and the framed extent.
 *
 * Enough on its own for a surface the explorer only draws — regions are read
 * as rows through their own catalog, not through a display projection.
 * Anything with a result rail wants {@link mapRecordSurface}; addresses moved
 * across when their rail became a page of the viewport (#962).
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
					...surfaceWhere(definition, input, input.filters),
					...envelopeWhere(definition.geom),
				],
				cluster: input.cluster,
			});
		},

		async getExtent(db, input) {
			return readMapExtent(db, {
				geom: definition.geom,
				from: definition.from,
				where: surfaceWhere(definition, input, input.filters),
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
	definition: MapSummaryDefinition<TFilters> & {
		readonly display: MapSurfaceDisplay<TRow, TFilters>;
	},
): MapRecordSurfaceReaders<TFilters, TRow> {
	const { display } = definition;
	const joins = display.joins ?? sql``;
	const columns = mapDisplaySelectList(display.columns);

	return {
		...mapSurface(definition),

		// `total` is the page's, not the row's, so it is not a display column: it
		// is declared here, on the cast of the read that appends it, and the
		// paged reader is the only place it exists. Putting it in the projection
		// would put it in `TRow`, where the by-id read that never selects it
		// would then claim it.
		async listByBounds(db, input) {
			const orderBy =
				typeof display.orderBy === 'function' ? display.orderBy(input.filters) : display.orderBy;
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
					${columns},
					count(*) over()::int as "total"
				from ${definition.from}
				${joins}
				cross join bounds
				where ${sql.join(
					[...surfaceWhere(definition, input, input.filters), ...envelopeWhere(definition.geom)],
					sql` and `,
				)}
				order by ${orderBy}
				limit ${input.limit}
				offset ${input.offset}
			`.execute(db);

			return { total: result.rows[0]?.total ?? 0, rows: result.rows };
		},

		async summarizeByBounds(db, input) {
			return readMapSummary(db, definition, input);
		},

		async getById(db, input) {
			const result = await sql<TRow>`
				select ${columns}
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

interface SummaryCountRow {
	/** The grouping's name, or null on the one row that counts the whole box. */
	readonly grouping: string | null;
	readonly value: string | boolean | null;
	readonly count: number;
	/** The figures summed, keyed by name, on the whole-box row of a surface declaring any. */
	readonly figures: Readonly<Record<string, number>> | null;
}

/** A surface definition with what its in-view summary counts and adds up. */
interface MapSummaryDefinition<TFilters> extends MapSurfaceDefinition<TFilters> {
	/** What the in-view summary counts by. A surface with none answers a total alone. */
	readonly groupings?: MapSurfaceGroupings;
	/** What the in-view summary adds up. A surface with none answers no figures. */
	readonly figures?: MapSurfaceFigures;
}

/**
 * The summary read: the records in the box once, then counted whole and by
 * each grouping.
 *
 * One statement, so the total and the groups are counted off the same rows.
 * The box's records are selected once into `in_view` with one column per
 * grouping, and each count reads that. The value goes out as `jsonb` because
 * the groupings are of different types, an id beside a flag, and a union needs
 * one: `to_jsonb` keeps a boolean a boolean and a null a null, where a `text`
 * cast would hand the client `'true'`.
 *
 * The grouping expressions are emitted under positional aliases, `g0`, `g1`,
 * and named by parameter in the union, so a grouping's name never reaches the
 * SQL as an identifier. Figures go the same way under `f0`, `f1`, summed or
 * maxed on the whole-box row into its own `figures` column, a `jsonb` object keyed by
 * name, which every grouping row leaves null.
 */
async function readMapSummary<TFilters>(
	db: DbExecutor,
	definition: MapSummaryDefinition<TFilters>,
	input: MapBoundsSummaryInput<TFilters>,
): Promise<MapSummaryResult> {
	const groupings = Object.entries(definition.groupings?.(input) ?? {});
	const figures = Object.entries(definition.figures?.(input) ?? {});
	const counts = groupings.map(([name, grouping], index) => groupingCount(name, grouping, index));

	const result = await sql<SummaryCountRow>`
		with bounds as (
			select st_makeenvelope(
				${input.bounds.west},
				${input.bounds.south},
				${input.bounds.east},
				${input.bounds.north},
				4326
			) as geom_4326
		),
		in_view as materialized (
			select ${summarySelectList(groupings, figures)}
			from ${definition.from}
			cross join bounds
			where ${sql.join(
				[...surfaceWhere(definition, input, input.filters), ...envelopeWhere(definition.geom)],
				sql` and `,
			)}
		)
		select
			null::text as "grouping",
			null::jsonb as "value",
			count(*)::int as "count",
			${figureSums(figures)} as "figures"
		from in_view
		${counts.length === 0 ? sql`` : sql.join(counts, sql``)}
	`.execute(db);

	return summaryFromRows(
		result.rows,
		groupings.map(([name]) => name),
	);
}

type SummaryGroupingEntry = readonly [string, RawBuilder<unknown> | MapSummaryGroupingEach];
type SummaryFigureEntry = readonly [string, RawBuilder<number> | MapSummaryFigureMax];

const groupAlias = (index: number) => sql.raw(`"g${index}"`);
const figureAlias = (index: number) => sql.raw(`"f${index}"`);

/** One column per grouping and per figure, or a bare `1` when the surface declares neither. */
function summarySelectList(
	groupings: readonly SummaryGroupingEntry[],
	figures: readonly SummaryFigureEntry[],
): RawBuilder<unknown> {
	const columns = [
		...groupings.map(
			([, grouping], index) =>
				sql`${'each' in grouping ? grouping.each : grouping} as ${groupAlias(index)}`,
		),
		...figures.map(
			([, figure], index) => sql`${'max' in figure ? figure.max : figure} as ${figureAlias(index)}`,
		),
	];
	return columns.length === 0 ? sql`1` : sql.join(columns, sql`, `);
}

/**
 * The figures over the box as one `jsonb` object, or null when there are none.
 * A sum over no records is zero; a `max` over none is null and stripped out.
 */
function figureSums(figures: readonly SummaryFigureEntry[]): RawBuilder<unknown> {
	if (figures.length === 0) {
		return sql`null::jsonb`;
	}
	return sql`jsonb_strip_nulls(jsonb_build_object(${sql.join(
		figures.map(([name, figure], index) =>
			'max' in figure
				? sql`${name}::text, max(${figureAlias(index)})`
				: sql`${name}::text, coalesce(sum(${figureAlias(index)}), 0)`,
		),
		sql`, `,
	)}))`;
}

/** One grouping's counts, unnesting an `each` grouping so a record counts under every value. */
function groupingCount(
	name: string,
	grouping: RawBuilder<unknown> | MapSummaryGroupingEach,
	index: number,
): RawBuilder<unknown> {
	if ('each' in grouping) {
		return sql`
			union all
			select ${name}::text, to_jsonb(each_value.value), count(*)::int, null::jsonb
			from in_view
			cross join lateral unnest(${groupAlias(index)}) as each_value(value)
			group by each_value.value
		`;
	}
	return sql`
		union all
		select ${name}::text, to_jsonb(${groupAlias(index)}), count(*)::int, null::jsonb
		from in_view
		group by ${groupAlias(index)}
	`;
}

/** The counted rows as the summary: every grouping a key, largest count first. */
function summaryFromRows(
	rows: readonly SummaryCountRow[],
	groupingNames: readonly string[],
): MapSummaryResult {
	const groups: Record<string, MapSummaryGroup[]> = Object.fromEntries(
		groupingNames.map((name) => [name, []]),
	);
	const whole = rows.find((row) => row.grouping === null);
	for (const row of rows) {
		if (row.grouping !== null) {
			groups[row.grouping]?.push({ value: row.value, count: row.count });
		}
	}
	for (const list of Object.values(groups)) {
		list.sort((first, second) => second.count - first.count);
	}
	const total = whole?.count ?? 0;
	const figures = whole?.figures ?? null;
	return figures === null ? { total, groups } : { total, groups, figures };
}

/**
 * Organization scope, soft delete, and whatever else the surface is always
 * narrowed by.
 *
 * Every reader on every surface starts here — that is the whole point of the
 * factory. A read that answered without these would hand one organization
 * another's records, or resurrect rows the organization deleted.
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
	context: MapReadContext,
	filters: TFilters | undefined,
): RawBuilder<boolean>[] {
	return [
		...scopeWhere(definition, context.organizationId),
		...(definition.filterWhere?.(filters, context) ?? []),
	];
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
