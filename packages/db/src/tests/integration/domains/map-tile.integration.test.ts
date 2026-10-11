import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { type Kysely, type RawBuilder, sql } from 'kysely';
import { PbfReader } from 'pbf';
import { expect, it } from 'vitest';
import type { MapTilesetLayer } from '../../../domains/map-layers.js';
import type { MapSurfaceReaders, MapTileInput } from '../../../domains/map-surface.js';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import { MAP_TILE_CLUSTERING, MAP_TILE_ENCODING, readMapTile } from '../../../domains/map-tile.js';
import type { SimmerDatabase } from '../../../index.js';
import {
	type MapSurfaceName,
	mapSurfaceLateCollectionId,
	mapSurfaceOrganizationIds,
	mapSurfacePlace,
	mapSurfaceRowIds,
	seedLateCollection,
	seedMapSurfaces,
} from '../../../seeds/map-surfaces.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

// --- clustered points in the shared tile read --------------------------------
//
// Every tileset reaches Postgres through `readMapTile`, so clustering is asked
// of it directly here, over a `values` list rather than a seeded table: the
// questions are about where points land on the tile grid, and a source written
// at known tile coordinates answers them without a schema's worth of rows.
//
// Positions are written in tile coordinates and converted to longitude and
// latitude with the slippy-map formulas below, which are this file's own and
// not the query's, so a cell that the query computes differently fails here.

const layer = 'clustered';
const cell = MAP_TILE_CLUSTERING.cellSize;

/** A tile low enough to cluster at. */
const tile = { z: 10, x: 300, y: 386 } as const;

interface SourceRow {
	readonly id: string;
	readonly label: string;
	readonly geom: RawBuilder<unknown>;
}

/** Longitude and latitude of a position on `tile`'s 4096 grid. */
function lngLatAt(
	at: { readonly z: number; readonly x: number; readonly y: number },
	tileX: number,
	tileY: number,
): { readonly lng: number; readonly lat: number } {
	const scale = 2 ** at.z;
	const extent = MAP_TILE_ENCODING.extent;
	const lng = ((at.x + tileX / extent) / scale) * 360 - 180;
	const n = Math.PI * (1 - (2 * (at.y + tileY / extent)) / scale);
	return { lng, lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI };
}

function pointAt(tileX: number, tileY: number): RawBuilder<unknown> {
	const { lng, lat } = lngLatAt(tile, tileX, tileY);
	return sql`st_setsrid(st_makepoint(${lng}::float8, ${lat}::float8), 4326)`;
}

function squareAt(fromX: number, fromY: number, toX: number, toY: number): RawBuilder<unknown> {
	const corners = [
		lngLatAt(tile, fromX, fromY),
		lngLatAt(tile, toX, fromY),
		lngLatAt(tile, toX, toY),
		lngLatAt(tile, fromX, toY),
		lngLatAt(tile, fromX, fromY),
	];
	const ring = corners.map(({ lng, lat }) => `${lng} ${lat}`).join(', ');
	return sql`st_geomfromtext(${`POLYGON((${ring}))`}, 4326)`;
}

function sourceOf(rows: readonly SourceRow[]): RawBuilder<unknown> {
	const values = rows.map((row) => sql`(${row.id}::text, ${row.label}::text, ${row.geom})`);
	return sql`(values ${sql.join(values, sql`, `)}) as r(id, label, geom)`;
}

async function readTile(
	db: Parameters<typeof readMapTile>[0],
	rows: readonly SourceRow[],
	at: { readonly z: number; readonly x: number; readonly y: number },
	cluster: boolean,
	properties: readonly RawBuilder<unknown>[] = [sql`r.id`, sql`r.label`],
): Promise<Uint8Array> {
	return readMapTile(db, {
		...at,
		layer,
		from: sourceOf(rows),
		geom: sql`r.geom`,
		properties,
		where: [
			sql<boolean>`r.geom && bounds.geom_4326`,
			sql<boolean>`st_intersects(r.geom, bounds.geom_4326)`,
		],
		cluster,
	});
}

function featuresOf(bytes: Uint8Array): VectorTileFeature[] {
	if (bytes.byteLength === 0) {
		return [];
	}
	const decoded = new VectorTile(new PbfReader(bytes)).layers[layer];
	if (decoded === undefined) {
		throw new Error(`Tile carries no ${layer} layer.`);
	}
	return Array.from({ length: decoded.length }, (_unused, index) => decoded.feature(index));
}

const isCluster = (feature: VectorTileFeature) => feature.properties.cluster === true;

/** How many records a tile's point features stand for, counting a cluster as its size. */
function pointsDrawn(features: readonly VectorTileFeature[]): number {
	return features
		.filter((feature) => VectorTileFeatureType[feature.type] === 'Point')
		.reduce(
			(total, feature) => total + (isCluster(feature) ? Number(feature.properties.point_count) : 1),
			0,
		);
}

/** `VectorTileFeature.type`: 1 point, 2 line, 3 polygon. */
const VectorTileFeatureType: Record<number, string> = { 1: 'Point', 2: 'LineString', 3: 'Polygon' };

// Three points in the first cell, two in the third, one alone in a cell of its
// own, and a polygon over the far corner.
const firstCell = [
	{ id: 'a1', at: [cell * 0.2, cell * 0.2] },
	{ id: 'a2', at: [cell * 0.4, cell * 0.3] },
	{ id: 'a3', at: [cell * 0.6, cell * 0.6] },
] as const;
const thirdCell = [
	{ id: 'b1', at: [cell * 2.2, cell * 0.2] },
	{ id: 'b2', at: [cell * 2.4, cell * 0.4] },
] as const;
const loneAt = [cell * 5.5, cell * 5.5] as const;

/** The tile east of {@link tile}, across the seam the seam cases sit on. */
const east = { ...tile, x: tile.x + 1 } as const;

/**
 * A point on the seam exactly: the east tile's western edge, read off the same
 * envelope function the query frames both tiles with, so it is selected by both.
 */
const seamPoint = sql`st_setsrid(st_makepoint(
	st_xmin(st_transform(st_tileenvelope(${east.z}, ${east.x}, ${east.y}), 4326)),
	${lngLatAt(east, 0, cell * 0.5).lat}::float8
), 4326)`;

const rows: readonly SourceRow[] = [
	...[...firstCell, ...thirdCell].map(({ id, at }) => ({
		id,
		label: id.toUpperCase(),
		geom: pointAt(at[0], at[1]),
	})),
	{ id: 'lone', label: 'Lone', geom: pointAt(loneAt[0], loneAt[1]) },
	{ id: 'area', label: 'Area', geom: squareAt(cell * 6.2, cell * 6.2, cell * 6.8, cell * 6.8) },
];

describeDbIntegration('clustered map tiles against Postgres', () => {
	it('draws the points of one cell as one cluster carrying its count and its box', async () => {
		await withTestDb(async ({ db }) => {
			const features = featuresOf(await readTile(db, rows, tile, true));
			const clusters = features.filter(isCluster);

			expect(clusters.map((feature) => feature.properties.point_count).sort()).toEqual([2, 3]);

			const first = clusters.find((feature) => feature.properties.point_count === 3);
			const corners = firstCell.map(({ at }) => lngLatAt(tile, at[0], at[1]));
			expect(first?.properties.cluster_west).toBeCloseTo(Math.min(...corners.map((c) => c.lng)), 9);
			expect(first?.properties.cluster_east).toBeCloseTo(Math.max(...corners.map((c) => c.lng)), 9);
			expect(first?.properties.cluster_south).toBeCloseTo(
				Math.min(...corners.map((c) => c.lat)),
				9,
			);
			expect(first?.properties.cluster_north).toBeCloseTo(
				Math.max(...corners.map((c) => c.lat)),
				9,
			);
			// A cluster is no record, so it carries none of the record's properties.
			expect(first?.properties.id).toBeUndefined();

			// Drawn at the mean of its points, which on the tile grid is the mean of
			// their tile coordinates, give or take the encoder's rounding.
			const [position] = first?.loadGeometry().flat() ?? [];
			const meanX = firstCell.reduce((sum, { at }) => sum + at[0], 0) / firstCell.length;
			const meanY = firstCell.reduce((sum, { at }) => sum + at[1], 0) / firstCell.length;
			expect(Math.abs((position?.x ?? Number.NaN) - meanX)).toBeLessThanOrEqual(1);
			expect(Math.abs((position?.y ?? Number.NaN) - meanY)).toBeLessThanOrEqual(1);
		});
	});

	it('keeps a point alone in its cell as its own feature, with exactly its own properties', async () => {
		await withTestDb(async ({ db }) => {
			const features = featuresOf(await readTile(db, rows, tile, true));
			const lone = features.filter((feature) => feature.properties.id === 'lone');

			expect(lone).toHaveLength(1);
			expect(lone[0]?.properties).toEqual({ id: 'lone', label: 'Lone' });
		});
	});

	it('passes a polygon through untouched', async () => {
		await withTestDb(async ({ db }) => {
			const area = (bytes: Uint8Array) =>
				featuresOf(bytes)
					.filter((feature) => feature.properties.id === 'area')
					.map((feature) => ({ properties: feature.properties, rings: feature.loadGeometry() }));

			const clustered = area(await readTile(db, rows, tile, true));
			expect(clustered).toHaveLength(1);
			expect(clustered).toEqual(area(await readTile(db, rows, tile, false)));
		});
	});

	it('stands for every record the unclustered tile draws, no more and no fewer', async () => {
		await withTestDb(async ({ db }) => {
			const clustered = featuresOf(await readTile(db, rows, tile, true));
			const unclustered = featuresOf(await readTile(db, rows, tile, false));

			// Two clusters, the lone point and the polygon.
			expect(clustered).toHaveLength(4);
			expect(unclustered).toHaveLength(7);
			expect(pointsDrawn(clustered)).toBe(pointsDrawn(unclustered));
			expect(pointsDrawn(clustered)).toBe(6);
		});
	});

	it('counts a point on a tile seam toward a cluster in one tile only', async () => {
		await withTestDb(async ({ db }) => {
			const companion = lngLatAt(east, cell * 0.3, cell * 0.5);
			const seamRows: readonly SourceRow[] = [
				{ id: 'seam', label: 'Seam', geom: seamPoint },
				{
					id: 'companion',
					label: 'Companion',
					geom: sql`st_setsrid(st_makepoint(${companion.lng}::float8, ${companion.lat}::float8), 4326)`,
				},
			];

			const west = featuresOf(await readTile(db, seamRows, tile, true));
			const eastTile = featuresOf(await readTile(db, seamRows, east, true));

			// The east tile owns it and clusters it with its companion; the west tile
			// draws it as itself and puts it in no cluster.
			expect(eastTile.filter(isCluster).map((feature) => feature.properties.point_count)).toEqual([
				2,
			]);
			expect(west.filter(isCluster)).toEqual([]);
			expect(west.map((feature) => feature.properties)).toEqual([{ id: 'seam', label: 'Seam' }]);
		});
	});

	it('draws a lone point on a seam in both tiles, the way the plain tiles do', async () => {
		await withTestDb(async ({ db }) => {
			const seamRows: readonly SourceRow[] = [{ id: 'seam', label: 'Seam', geom: seamPoint }];
			const ids = async (
				at: { readonly z: number; readonly x: number; readonly y: number },
				cluster: boolean,
			) =>
				featuresOf(await readTile(db, seamRows, at, cluster)).map(
					(feature) => feature.properties.id,
				);

			// Each tile carries its copy, so the circle is whole across the edge.
			expect(await ids(tile, false)).toEqual(['seam']);
			expect(await ids(east, false)).toEqual(['seam']);
			expect(await ids(tile, true)).toEqual(['seam']);
			expect(await ids(east, true)).toEqual(['seam']);
		});
	});

	it('puts none of the record properties on a cluster, even one with a value over no row', async () => {
		await withTestDb(async ({ db }) => {
			// The shape of the collections status: an expression answering for a
			// row with nothing in it.
			const properties = [sql`r.id`, sql`coalesce(r.label, 'unlabelled') as "labelOrNone"`];
			const features = featuresOf(await readTile(db, rows, tile, true, properties));

			for (const cluster of features.filter(isCluster)) {
				expect(Object.keys(cluster.properties).sort()).toEqual([
					'cluster',
					'cluster_east',
					'cluster_north',
					'cluster_south',
					'cluster_west',
					'point_count',
				]);
			}
			expect(features.find((feature) => feature.properties.id === 'lone')?.properties).toEqual({
				id: 'lone',
				labelOrNone: 'Lone',
			});
		});
	});

	it('draws the unclustered tile at and above the cut-off zoom', async () => {
		await withTestDb(async ({ db }) => {
			const zoomIn = 2 ** (MAP_TILE_CLUSTERING.untilZoom - tile.z);
			const close = {
				z: MAP_TILE_CLUSTERING.untilZoom,
				x: tile.x * zoomIn,
				y: tile.y * zoomIn,
			};

			const clustered = await readTile(db, rows, close, true);
			const unclustered = await readTile(db, rows, close, false);

			expect(featuresOf(unclustered).length).toBeGreaterThan(0);
			expect(Buffer.from(clustered).equals(Buffer.from(unclustered))).toBe(true);
		});
	});
});

// --- every surface that clusters, over the seeded tables ---------------------
//
// The cases above ask the shared read about the grid. These ask each surface
// that clusters whether its own scope and filters still hold once it does,
// because the clustered read runs the surface's predicates twice, once for the
// cells and once for the records that stay themselves, and a predicate that
// reached only one half would hand a cluster records the plain tile never
// draws.
//
// Each surface gets a companion: a copy of its live `inside` record on the same
// spot, differing in one column that one of its filters reads. Unfiltered, the
// two share a cell and draw as one cluster of two. Filtered, one of them is
// left, and it draws as itself.

interface ClusteringSurface {
	readonly name: MapSurfaceName;
	readonly layer: MapTilesetLayer;
	/** The table the companion is copied within. */
	readonly table: string;
	/** The columns the companion differs on, each with its new value. */
	readonly companion: Readonly<Record<string, unknown>>;
	/** Which of the two the filter leaves. */
	readonly kept: 'inside' | 'companion';
	/** The surface's tile, with the filter that tells the two apart or none. */
	readonly tile: (
		db: Kysely<SimmerDatabase>,
		input: Omit<MapTileInput<never>, 'filters'>,
		filtered: boolean,
	) => Promise<Uint8Array>;
}

/** A surface's tile reader, handed `filters` only when the case asks for them. */
function filteredTile<TFilters>(
	surface: MapSurfaceReaders<TFilters>,
	filters: TFilters,
): ClusteringSurface['tile'] {
	return (db, input, filtered) => surface.getTile(db, filtered ? { ...input, filters } : input);
}

/**
 * A day well before the seed's operational date, for the companion, and a
 * `dateFrom` between the two. Days apart rather than one, because the seed
 * writes its dates as instants and the day one lands on moves with the zone the
 * driver converts it in.
 */
const dayBefore = '2026-03-01';
const seedDay = '2026-03-08';

const clusteringSurfaces: readonly ClusteringSurface[] = [
	{
		name: 'habitat',
		layer: 'habitats',
		table: 'habitats',
		companion: { is_active: false },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES.habitats, { isActive: true }),
	},
	{
		name: 'address',
		layer: 'addresses',
		table: 'addresses',
		companion: { display_name: '200 Oak Ave' },
		kept: 'companion',
		tile: filteredTile(MAP_SURFACES.addresses, { search: 'Oak' }),
	},
	{
		name: 'inspection',
		layer: 'inspections',
		table: 'inspections',
		companion: { inspection_date: dayBefore },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES.inspections, { dateFrom: seedDay }),
	},
	{
		name: 'sample',
		layer: 'samples',
		table: 'samples',
		companion: { has_non_mosquito: true },
		kept: 'companion',
		tile: filteredTile(MAP_SURFACES.samples, { nonMosquitoOnly: true }),
	},
	{
		name: 'application',
		layer: 'chemical',
		table: 'applications',
		companion: { application_date: dayBefore },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES.chemical, { dateFrom: seedDay }),
	},
	{
		name: 'sourceReduction',
		layer: 'source-reduction',
		table: 'source_reductions',
		companion: { source_reduction_date: dayBefore },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES['source-reduction'], { dateFrom: seedDay }),
	},
	{
		name: 'biocontrol',
		layer: 'biocontrol',
		table: 'biocontrol_actions',
		companion: { biocontrol_date: dayBefore },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES.biocontrol, { dateFrom: seedDay }),
	},
	{
		name: 'outreach',
		layer: 'outreach',
		table: 'outreach_actions',
		companion: { outreach_date: dayBefore },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES.outreach, { dateFrom: seedDay }),
	},
	{
		name: 'trap',
		layer: 'traps',
		table: 'traps',
		companion: { is_active: false },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES.traps, { isActive: true }),
	},
	{
		name: 'collection',
		layer: 'collections',
		table: 'collections',
		companion: { has_problem: true },
		kept: 'companion',
		tile: filteredTile(MAP_SURFACES.collections, { problemOnly: true }),
	},
	{
		name: 'serviceRequest',
		layer: 'service-requests',
		table: 'service_requests',
		// The display name is unique per organization, so the copy takes none.
		companion: { request_date: dayBefore, display_name: null },
		kept: 'inside',
		tile: filteredTile(MAP_SURFACES['service-requests'], { dateFrom: seedDay }),
	},
];

/** The companion's id: the surface's `inside` id with its last digit swapped. */
function companionId(name: MapSurfaceName): string {
	return mapSurfaceRowIds[name].inside.replace(/1$/, '9');
}

/**
 * Copy one row of `table` under a new id, with some columns changed.
 *
 * Every column a write can set is carried over, read off the catalog rather than
 * listed per table, so the copy satisfies the same constraints the seeded row
 * does. Generated columns are left to Postgres.
 */
async function copyRow(
	db: Kysely<SimmerDatabase>,
	table: string,
	fromId: string,
	toId: string,
	changes: Readonly<Record<string, unknown>>,
): Promise<void> {
	const columns = await sql<{ readonly name: string; readonly type: string }>`
		select column_name as name, udt_name as type
		from information_schema.columns
		where table_schema = current_schema() and table_name = ${table} and is_generated = 'NEVER'
		order by ordinal_position
	`.execute(db);
	const values = columns.rows.map(({ name, type }) => {
		if (name === 'id') {
			return sql`${toId}::uuid`;
		}
		return Object.hasOwn(changes, name) ? sql`${changes[name]}::${sql.raw(type)}` : sql.ref(name);
	});

	await sql`
		insert into ${sql.table(table)} (${sql.join(columns.rows.map(({ name }) => sql.ref(name)))})
		select ${sql.join(values)} from ${sql.table(table)} where id = ${fromId}
	`.execute(db);
}

/** The features of one surface's tile, with the layer name it encodes under. */
function surfaceFeatures(bytes: Uint8Array, layerName: string): VectorTileFeature[] {
	const decoded =
		bytes.byteLength === 0 ? undefined : new VectorTile(new PbfReader(bytes)).layers[layerName];
	return Array.from({ length: decoded?.length ?? 0 }, (_unused, index) => {
		const feature = decoded?.feature(index);
		if (feature === undefined) {
			throw new Error(`Tile lost feature ${index} of ${layerName}.`);
		}
		return feature;
	});
}

/** Each feature as the map reads it: a record's id, or a cluster's count. */
function drawn(features: readonly VectorTileFeature[]): readonly (string | number)[] {
	return features.map((feature) =>
		isCluster(feature) ? Number(feature.properties.point_count) : String(feature.properties.id),
	);
}

const ownTile = {
	...mapSurfacePlace.tile,
	organizationId: mapSurfaceOrganizationIds.own,
	timeZone: 'America/New_York',
} as const;

describeDbIntegration('clustered map surfaces against Postgres', () => {
	it('keeps every surface that clusters scoped to the organization’s live records', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			// The deleted record and the other organization's sit on top of the live
			// one, so a clustered read that lost its scope answers with a cluster of
			// three where one record was seeded.
			const read = await Promise.all(
				clusteringSurfaces.map(async (surface) => [
					surface.name,
					drawn(
						surfaceFeatures(
							await surface.tile(db, { ...ownTile, cluster: true }, false),
							surface.layer,
						),
					),
				]),
			);

			expect(Object.fromEntries(read)).toEqual(
				Object.fromEntries(
					clusteringSurfaces.map((surface) => [
						surface.name,
						[mapSurfaceRowIds[surface.name].inside],
					]),
				),
			);
		});
	});

	it('narrows every surface’s clusters by its filters, the way it narrows its points', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			for (const surface of clusteringSurfaces) {
				await copyRow(
					db,
					surface.table,
					mapSurfaceRowIds[surface.name].inside,
					companionId(surface.name),
					surface.companion,
				);
			}

			const read = await Promise.all(
				clusteringSurfaces.map(async (surface) => {
					const tile = async (cluster: boolean, filtered: boolean) =>
						drawn(
							surfaceFeatures(
								await surface.tile(db, { ...ownTile, ...(cluster ? { cluster } : {}) }, filtered),
								surface.layer,
							),
						);
					return [
						surface.name,
						{
							unfiltered: await tile(true, false),
							filtered: await tile(true, true),
							plainFiltered: await tile(false, true),
						},
					] as const;
				}),
			);

			expect(Object.fromEntries(read)).toEqual(
				Object.fromEntries(
					clusteringSurfaces.map((surface) => {
						const kept =
							surface.kept === 'inside'
								? mapSurfaceRowIds[surface.name].inside
								: companionId(surface.name);
						return [surface.name, { unfiltered: [2], filtered: [kept], plainFiltered: [kept] }];
					}),
				),
			);
		});
	});

	// A collection is dated by one of two columns, by its own timing mode: a plain
	// `collection_date` no zone moves, or an exact `collected_at` that falls on the
	// organization's day rather than the server's. The window is a predicate like
	// any other, so a cluster must hold exactly the collections the plain tile
	// draws, in either mode and in either zone.
	it('clusters collections by the organization’s day, whichever timing mode dates them', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await seedLateCollection(db);

			const ids = mapSurfaceRowIds.collection;
			// Two exact-timestamp collections on the late instant, which is the 15th
			// in New York and the 16th in UTC.
			const exact = [mapSurfaceLateCollectionId, mapSurfaceLateCollectionId.replace(/6$/, '9')];
			await copyRow(db, 'collections', mapSurfaceLateCollectionId, exact[1] ?? '', {});
			// Two date-and-duration collections typed as the 15th, which no zone moves.
			const typed = [ids.inside.replace(/1$/, '7'), ids.inside.replace(/1$/, '8')];
			for (const id of typed) {
				await copyRow(db, 'collections', ids.inside, id, { collection_date: '2026-03-15' });
			}
			// The seeded collection's day depends on the zone the driver wrote its
			// date in, so it is moved out of every window asked about here.
			await sql`update collections set collection_date = '2026-03-01' where id = ${ids.inside}`.execute(
				db,
			);

			const read = async (timeZone: string, day: string, cluster: boolean) =>
				surfaceFeatures(
					await MAP_SURFACES.collections.getTile(db, {
						...ownTile,
						timeZone,
						filters: { dateFrom: day, dateTo: day },
						...(cluster ? { cluster } : {}),
					}),
					'collections',
				);

			const passes = [
				// Both modes at once: the organization's 15th holds all four.
				{ timeZone: 'America/New_York', day: '2026-03-15', expected: [...typed, ...exact] },
				// The date mode alone: in UTC the exact instant has moved to the 16th.
				{ timeZone: 'UTC', day: '2026-03-15', expected: typed },
				// The exact mode alone, on the day UTC files it under.
				{ timeZone: 'UTC', day: '2026-03-16', expected: exact },
			];
			for (const { timeZone, day, expected } of passes) {
				const plain = drawn(await read(timeZone, day, false));
				const clustered = await read(timeZone, day, true);

				expect([...plain].sort()).toEqual([...expected].sort());
				// One cell, so the clustered tile is one cluster standing for every
				// collection the plain tile draws.
				expect(drawn(clustered)).toEqual([expected.length]);
			}
		});
	});
});
