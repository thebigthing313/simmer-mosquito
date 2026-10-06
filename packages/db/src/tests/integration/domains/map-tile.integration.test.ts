import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { type RawBuilder, sql } from 'kysely';
import { PbfReader } from 'pbf';
import { expect, it } from 'vitest';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import { MAP_TILE_CLUSTERING, MAP_TILE_ENCODING, readMapTile } from '../../../domains/map-tile.js';
import {
	mapSurfaceOrganizationIds,
	mapSurfacePlace,
	mapSurfaceRowIds,
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
): Promise<Uint8Array> {
	return readMapTile(db, {
		...at,
		layer,
		from: sourceOf(rows),
		geom: sql`r.geom`,
		properties: [sql`r.id`, sql`r.label`],
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

	it('counts a point on a tile seam in one tile only', async () => {
		await withTestDb(async ({ db }) => {
			const east = { ...tile, x: tile.x + 1 };
			// On the seam exactly: the east tile's western edge, read off the same
			// envelope function the query frames both tiles with.
			const seam = sql`st_setsrid(st_makepoint(
				st_xmin(st_transform(st_tileenvelope(${east.z}, ${east.x}, ${east.y}), 4326)),
				${lngLatAt(east, 0, cell * 0.5).lat}::float8
			), 4326)`;
			const companion = lngLatAt(east, cell * 0.3, cell * 0.5);
			const seamRows: readonly SourceRow[] = [
				{ id: 'seam', label: 'Seam', geom: seam },
				{
					id: 'companion',
					label: 'Companion',
					geom: sql`st_setsrid(st_makepoint(${companion.lng}::float8, ${companion.lat}::float8), 4326)`,
				},
			];

			// Unclustered, the seam point is drawn by both tiles, which is what a
			// cluster would count twice.
			const westPlain = featuresOf(await readTile(db, seamRows, tile, false));
			expect(westPlain.map((feature) => feature.properties.id)).toEqual(['seam']);

			const west = featuresOf(await readTile(db, seamRows, tile, true));
			const eastTile = featuresOf(await readTile(db, seamRows, east, true));

			expect(pointsDrawn(west) + pointsDrawn(eastTile)).toBe(2);
			expect(eastTile.filter(isCluster).map((feature) => feature.properties.point_count)).toEqual([
				2,
			]);
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

	it('keeps the traps surface scoped when it clusters', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			// The deleted trap and the other organization's sit on top of the live
			// one, so a clustered read that lost its scope answers with a cluster of
			// three where one trap was seeded.
			const tileBytes = await MAP_SURFACES.traps.getTile(db, {
				...mapSurfacePlace.tile,
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: 'America/New_York',
				cluster: true,
			});
			const decoded = new VectorTile(new PbfReader(tileBytes)).layers.traps;
			const features = Array.from({ length: decoded?.length ?? 0 }, (_unused, index) =>
				decoded?.feature(index),
			);

			expect(features.map((feature) => feature?.properties.id)).toEqual([
				mapSurfaceRowIds.trap.inside,
			]);
		});
	});
});
