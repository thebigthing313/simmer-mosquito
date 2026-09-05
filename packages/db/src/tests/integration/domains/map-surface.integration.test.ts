import { VectorTile } from '@mapbox/vector-tile';
import type { Kysely } from 'kysely';
import { PbfReader } from 'pbf';
import { expect, it } from 'vitest';
import {
	getCollectionDisplayRowById,
	getCollectionMapExtent,
	getCollectionMvtTile,
	getTrapDisplayRowById,
	getTrapMapExtent,
	getTrapMvtTile,
	listCollectionDisplayRowsPage,
	listTrapDisplayRowsPage,
} from '../../../domains/adult-surveillance.js';
import {
	getApplicationDisplayRowById,
	getApplicationMapExtent,
	getApplicationMvtTile,
	getBiocontrolDisplayRowById,
	getBiocontrolMapExtent,
	getBiocontrolMvtTile,
	getOutreachDisplayRowById,
	getOutreachMapExtent,
	getOutreachMvtTile,
	getRequestedControlActionDisplayRowById,
	getSourceReductionDisplayRowById,
	getSourceReductionMapExtent,
	getSourceReductionMvtTile,
	listApplicationDisplayRowsPage,
	listBiocontrolDisplayRowsPage,
	listOutreachDisplayRowsPage,
	listSourceReductionDisplayRowsPage,
} from '../../../domains/control-operations-map.js';
import {
	getAddressMapExtent,
	getAddressMvtTile,
	getRegionMapExtent,
	getRegionMvtTile,
} from '../../../domains/foundation-geography.js';
import {
	getHabitatDisplayRowById,
	getHabitatMapExtent,
	getHabitatMvtTile,
	listHabitatDisplayRowsByBounds,
} from '../../../domains/habitats.js';
import {
	getInspectionDisplayRowById,
	getInspectionMapExtent,
	getInspectionMvtTile,
	getSampleDisplayRowById,
	getSampleMapExtent,
	getSampleMvtTile,
	listInspectionDisplayRowsByBounds,
	listSampleDisplayRowsByBounds,
} from '../../../domains/larval-surveillance.js';
import type { MapExtent } from '../../../domains/map-extent.js';
import { getNotificationRegistrationGeometryById } from '../../../domains/public-engagement-map.js';
import type { SimmerDatabase } from '../../../index.js';
import {
	type MapSurfaceName,
	type MapSurfaceRowIds,
	mapSurfaceLateCollectionDates,
	mapSurfaceLateCollectionId,
	mapSurfaceOrganizationIds,
	mapSurfacePlace,
	mapSurfaceRowIds,
	mapSurfaceSampleOnDeletedInspectionId,
	mapSurfaceStampedCollectionIds,
	mapSurfaceStampedTimeZone,
	mapSurfaceStampedTypedDay,
	mapSurfaceStatusCollectionIds,
	mapSurfaceStatusCollections,
	seedLateCollection,
	seedMapSurfaces,
	seedStampedCollections,
	seedStatusCollections,
} from '../../../seeds/map-surfaces.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

// --- what the map surfaces actually answer -----------------------------------
//
// `map-surface-sql.test.ts` compiles all forty-one map reads and pins the SQL,
// which proves ADR 0008's organization and soft-delete predicates are written.
// It pins text, not execution: no read in this package has ever been run
// against Postgres, so a predicate on the wrong alias, a join that outlives its
// parent's delete, or an envelope that frames the wrong corner would keep that
// suite green and hand one organization another organization's records.
//
// This runs every one of them. The seed puts each surface's live record on top
// of a deleted one and a neighbouring organization's, so a read that lost its
// scope answers with three where one was seeded — the returned id set is the
// whole assertion, and it is compared for all twelve surfaces at once so a
// broken predicate shows up as a diff naming its surface rather than one
// failure that stops the loop.
//
// Filters are deliberately absent. Every read is called with no filters at all,
// which is the state the predicates under test must hold in unaided; what each
// surface's filters *emit* is pinned next door, and exercising the ~40 of them
// against seeded data is its own piece of work.

/** The reads one surface offers, whichever of the four it has. */
interface SurfaceUnderTest {
	readonly name: MapSurfaceName;
	readonly tile?: (
		db: Kysely<SimmerDatabase>,
		input: { z: number; x: number; y: number; organizationId: string; timeZone: string },
	) => Promise<Uint8Array>;
	/** The layer name the tile's features are encoded under. */
	readonly layer?: string;
	readonly extent?: (
		db: Kysely<SimmerDatabase>,
		input: { organizationId: string; timeZone: string },
	) => Promise<MapExtent | null>;
	/** The unbounded paged list, however the surface spells it. */
	readonly page?: (
		db: Kysely<SimmerDatabase>,
		input: { organizationId: string; timeZone: string; limit: number; offset: number },
	) => Promise<{ total: number; rows: ReadonlyArray<{ id: string }> }>;
	/** The paged list inside an explicit bounding box. */
	readonly boundsPage?: (
		db: Kysely<SimmerDatabase>,
		input: {
			organizationId: string;
			timeZone: string;
			bounds: typeof mapSurfacePlace.bounds;
			limit: number;
			offset: number;
		},
	) => Promise<{ total: number; rows: ReadonlyArray<{ id: string }> }>;
	readonly byId?: (
		db: Kysely<SimmerDatabase>,
		input: { organizationId: string; id: string },
	) => Promise<{ id: string } | undefined>;
	/** How far the surface's geometry reaches beyond its seeded point, in degrees. */
	readonly padding?: number;
}

/**
 * The organization zone every surface is read in. Deliberately not UTC: a
 * surface that stopped converting `collected_at` would still pass under UTC,
 * because UTC is exactly the wrong answer this issue is about.
 */
const mapSurfaceTimeZone = 'America/New_York';

/** Regions are areas, so their extent runs half a box wider than their centre. */
const boxPadding = 0.02;

const surfaces: readonly SurfaceUnderTest[] = [
	{
		name: 'habitat',
		layer: 'habitats',
		tile: getHabitatMvtTile,
		extent: getHabitatMapExtent,
		boundsPage: listHabitatDisplayRowsByBounds,
		byId: getHabitatDisplayRowById,
	},
	{
		name: 'inspection',
		layer: 'inspections',
		tile: getInspectionMvtTile,
		extent: getInspectionMapExtent,
		boundsPage: listInspectionDisplayRowsByBounds,
		byId: getInspectionDisplayRowById,
	},
	{
		name: 'sample',
		layer: 'samples',
		tile: getSampleMvtTile,
		extent: getSampleMapExtent,
		boundsPage: listSampleDisplayRowsByBounds,
		byId: getSampleDisplayRowById,
	},
	{
		name: 'trap',
		layer: 'traps',
		tile: getTrapMvtTile,
		extent: getTrapMapExtent,
		page: listTrapDisplayRowsPage,
		byId: getTrapDisplayRowById,
	},
	{
		name: 'collection',
		layer: 'collections',
		tile: getCollectionMvtTile,
		extent: getCollectionMapExtent,
		page: listCollectionDisplayRowsPage,
		byId: getCollectionDisplayRowById,
	},
	{
		name: 'application',
		layer: 'chemical',
		tile: getApplicationMvtTile,
		extent: getApplicationMapExtent,
		page: listApplicationDisplayRowsPage,
		byId: getApplicationDisplayRowById,
	},
	{
		name: 'sourceReduction',
		layer: 'source-reduction',
		tile: getSourceReductionMvtTile,
		extent: getSourceReductionMapExtent,
		page: listSourceReductionDisplayRowsPage,
		byId: getSourceReductionDisplayRowById,
	},
	{
		name: 'biocontrol',
		layer: 'biocontrol',
		tile: getBiocontrolMvtTile,
		extent: getBiocontrolMapExtent,
		page: listBiocontrolDisplayRowsPage,
		byId: getBiocontrolDisplayRowById,
	},
	{
		name: 'outreach',
		layer: 'outreach',
		tile: getOutreachMvtTile,
		extent: getOutreachMapExtent,
		page: listOutreachDisplayRowsPage,
		byId: getOutreachDisplayRowById,
	},
	// No explorer, no tile, no list — the queue is read from the Electric shape
	// and this exists only to hand the detail card the geometry that shape omits.
	{ name: 'requestedControlAction', byId: getRequestedControlActionDisplayRowById },
	// Same shape, and for the same reason: the registrations explorer draws each
	// buffer from the centroid the Electric shape carries, and only the edit form
	// needs the shape itself back.
	{ name: 'notificationRegistration', byId: getNotificationRegistrationGeometryById },
	{ name: 'address', layer: 'addresses', tile: getAddressMvtTile, extent: getAddressMapExtent },
	{
		name: 'region',
		layer: 'regions',
		tile: getRegionMvtTile,
		extent: getRegionMapExtent,
		padding: boxPadding,
	},
];

const page = { limit: 50, offset: 0 };

describeDbIntegration('map surfaces against Postgres', () => {
	it('draws only this organization’s live records inside the tile', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			const drawn = await mapSurfaces(
				(surface) => surface.tile !== undefined,
				async (surface) => {
					const tile = await surface.tile?.(db, {
						...mapSurfacePlace.tile,
						organizationId: mapSurfaceOrganizationIds.own,
						timeZone: mapSurfaceTimeZone,
					});
					return featureIds(tile, surface.layer ?? '');
				},
			);

			// One id per surface: the outside record is in another tile, and the
			// deleted and neighbouring-organization records sit exactly on top of the
			// one that should be drawn.
			expect(drawn).toEqual(
				expectedPerSurface(
					(ids) => [ids.inside],
					(s) => s.tile !== undefined,
				),
			);
		});
	});

	it('answers an empty tile with an empty buffer rather than nothing', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			const lengths = await mapSurfaces(
				(surface) => surface.tile !== undefined,
				async (surface) => {
					const tile = await surface.tile?.(db, {
						...mapSurfacePlace.emptyTile,
						organizationId: mapSurfaceOrganizationIds.own,
						timeZone: mapSurfaceTimeZone,
					});
					// A tile with no features is a valid answer the client caches; a
					// null or a throw would make the map retry an empty viewport
					// forever.
					expect(tile).toBeInstanceOf(Uint8Array);
					return tile?.byteLength;
				},
			);

			expect(lengths).toEqual(
				expectedPerSurface(
					() => 0,
					(s) => s.tile !== undefined,
				),
			);
		});
	});

	it('frames every live record of this organization and no other', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			const framed = await mapSurfaces(
				(surface) => surface.extent !== undefined,
				async (surface) => ({
					own: rounded(
						await surface.extent?.(db, {
							organizationId: mapSurfaceOrganizationIds.own,
							timeZone: mapSurfaceTimeZone,
						}),
					),
					other: rounded(
						await surface.extent?.(db, {
							organizationId: mapSurfaceOrganizationIds.other,
							timeZone: mapSurfaceTimeZone,
						}),
					),
				}),
			);

			expect(framed).toEqual(
				expectedPerSurface(
					(_ids, padding) => ({
						// The span of `inside` and `outside`, and nothing wider: the far
						// soft-deleted record would push `east` to -70 and `south` to 25.
						own: {
							west: round(mapSurfacePlace.outside.lng - padding),
							south: round(mapSurfacePlace.inside.lat - padding),
							east: round(mapSurfacePlace.inside.lng + padding),
							north: round(mapSurfacePlace.outside.lat + padding),
						},
						// The neighbouring organization seeded one record, at `inside`. Its
						// camera must frame that and never this organization's `outside`.
						other: {
							west: round(mapSurfacePlace.inside.lng - padding),
							south: round(mapSurfacePlace.inside.lat - padding),
							east: round(mapSurfacePlace.inside.lng + padding),
							north: round(mapSurfacePlace.inside.lat + padding),
						},
					}),
					(surface) => surface.extent !== undefined,
				),
			);
		});
	});

	it('lists this organization’s live records, viewport-bounded or not', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			const paged = await mapSurfaces(
				(surface) => surface.page !== undefined,
				async (surface) => {
					const result = await surface.page?.(db, {
						organizationId: mapSurfaceOrganizationIds.own,
						timeZone: mapSurfaceTimeZone,
						...page,
					});
					return { ids: sortedIds(result?.rows), total: result?.total };
				},
			);

			// Unbounded: `outside` belongs in the result rail even though it is off
			// screen. Deleted and the other organization's never do.
			expect(paged).toEqual(
				expectedPerSurface(
					(ids) => ({ ids: [ids.inside, ids.outside].sort(), total: 2 }),
					(surface) => surface.page !== undefined,
				),
			);

			const bounded = await mapSurfaces(
				(surface) => surface.boundsPage !== undefined,
				async (surface) => {
					const result = await surface.boundsPage?.(db, {
						organizationId: mapSurfaceOrganizationIds.own,
						timeZone: mapSurfaceTimeZone,
						bounds: mapSurfacePlace.bounds,
						...page,
					});
					return { ids: sortedIds(result?.rows), total: result?.total };
				},
			);

			expect(bounded).toEqual(
				expectedPerSurface(
					(ids) => ({ ids: [ids.inside], total: 1 }),
					(surface) => surface.boundsPage !== undefined,
				),
			);
		});
	});

	it('opens one record, and refuses a deleted or borrowed id', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			const opened = await mapSurfaces(
				(surface) => surface.byId !== undefined,
				async (surface) => {
					const ids = mapSurfaceRowIds[surface.name];
					const read = async (id: string): Promise<string | undefined> =>
						(await surface.byId?.(db, { organizationId: mapSurfaceOrganizationIds.own, id }))?.id;

					return {
						live: await read(ids.inside),
						// Off screen, but by-id is not viewport-bounded.
						outside: await read(ids.outside),
						deleted: await read(ids.deleted),
						otherOrg: await read(ids.otherOrg),
					};
				},
			);

			expect(opened).toEqual(
				expectedPerSurface(
					(ids) => ({
						live: ids.inside,
						outside: ids.outside,
						deleted: undefined,
						otherOrg: undefined,
					}),
					(surface) => surface.byId !== undefined,
				),
			);
		});
	});

	// A `timestamptz` becomes a calendar date in whichever zone does the
	// converting, and the database server's is not the organization's. This is
	// worse than a mislabelled row: at the edge of a window the collection falls
	// *outside the range that was asked for* and is simply absent.
	it('windows a collection by the organization’s day, not the database server’s', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await seedLateCollection(db);

			// A one-day window on the day New York says the collection happened.
			const onTheOrganizationsDay = async (timeZone: string): Promise<readonly string[]> => {
				const day = mapSurfaceLateCollectionDates['America/New_York'];
				const result = await listCollectionDisplayRowsPage(db, {
					organizationId: mapSurfaceOrganizationIds.own,
					timeZone,
					limit: 50,
					offset: 0,
					filters: { dateFrom: day, dateTo: day },
				});
				return result.rows.map((row) => row.id);
			};

			// Collected 2026-03-16T02:30Z — 10:30pm on the 15th in New York.
			expect(await onTheOrganizationsDay('America/New_York')).toContain(mapSurfaceLateCollectionId);
			// Converted in UTC the same instant is the 16th, so the 15th loses it.
			expect(await onTheOrganizationsDay('UTC')).not.toContain(mapSurfaceLateCollectionId);
		});
	});

	// The other half of the same seam. The test above proves the *reader* takes
	// the organization's zone; this one proves the *stamp* the client writes
	// agrees with it. Both are correct in isolation and were written months apart
	// — issue #156 is what happened in between, and it lived entirely in the gap.
	it('files a typed day under that day, from a zone past +12', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await seedStampedCollections(db);

			const onTheTypedDay = await listCollectionDisplayRowsPage(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceStampedTimeZone,
				limit: 50,
				offset: 0,
				filters: { dateFrom: mapSurfaceStampedTypedDay, dateTo: mapSurfaceStampedTypedDay },
			});
			const found = onTheTypedDay.rows.map((row) => row.id);

			expect(found).toContain(mapSurfaceStampedCollectionIds.organizationMidday);
			// And the stamp this replaced, through the same reader, is a day late —
			// so if anything puts midday UTC back, the assertion above starts
			// failing and this one says why.
			expect(found).not.toContain(mapSurfaceStampedCollectionIds.utcMidday);
		});
	});

	it('refuses a timezone that is not an IANA name', async () => {
		await withTestDb(async ({ db }) => {
			// The zone is spliced into the SQL rather than bound, so the only thing
			// standing between a bad value and the query is this check.
			await expect(
				listCollectionDisplayRowsPage(db, {
					organizationId: mapSurfaceOrganizationIds.own,
					timeZone: "UTC'; drop table collections --",
					limit: 1,
					offset: 0,
					filters: {},
				}),
			).rejects.toThrow(/Invalid IANA time zone/);
		});
	});

	// The status is one `case` expression read by two things: the tile, which
	// colours the dot on the map, and the display columns, which colour the dot in
	// the result rail. Until now the only thing asserting on it was the SQL
	// snapshot, which approves whatever it is regenerated against — so a reordered
	// branch was a passing test and a wrong colour.
	it('resolves a collection’s status by precedence, and by its own timing mode', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await seedStatusCollections(db);

			const drawn = await getCollectionMvtTile(db, {
				...mapSurfacePlace.tile,
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
			});
			const listed = await listCollectionDisplayRowsPage(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
				...page,
				filters: {},
			});

			const answered = {
				tile: byStatusCase(featureProperty(drawn, 'collections', 'status')),
				rail: byStatusCase(new Map(listed.rows.map((row) => [row.id, row.status] as const))),
			};

			// Both readers, in one diff: the whole reason the expression is shared is
			// that the map and the rail can never disagree about what a collection is.
			expect(answered).toEqual({
				tile: mapSurfaceStatusCollections,
				rail: mapSurfaceStatusCollections,
			});
		});
	});

	it('drops a sample whose inspection was deleted under it', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

			// The sample itself is live and this organization's — only its parent is
			// gone. Samples read their geometry through that join, so without the
			// join's own soft-delete predicate this row would draw at a place its
			// organization no longer has a record for.
			const opened = await getSampleDisplayRowById(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				id: mapSurfaceSampleOnDeletedInspectionId,
			});

			expect(opened).toBeUndefined();
		});
	});
});

/** Run one read across the surfaces that offer it, keyed by surface name. */
async function mapSurfaces<T>(
	offers: (surface: SurfaceUnderTest) => boolean,
	read: (surface: SurfaceUnderTest) => Promise<T>,
): Promise<Record<string, T>> {
	const entries = await Promise.all(
		surfaces.filter(offers).map(async (surface) => [surface.name, await read(surface)] as const),
	);

	return Object.fromEntries(entries);
}

/** The same expectation for every surface that offers a read, keyed to match. */
function expectedPerSurface<T>(
	expected: (ids: MapSurfaceRowIds, padding: number) => T,
	offers: (surface: SurfaceUnderTest) => boolean,
): Record<string, T> {
	return Object.fromEntries(
		surfaces
			.filter(offers)
			.map((surface) => [
				surface.name,
				expected(mapSurfaceRowIds[surface.name], surface.padding ?? 0),
			]),
	);
}

/**
 * An extent at four decimal places — about eleven metres, and far finer than the
 * degrees between the seeded records.
 *
 * Compared by value rather than with `toBeCloseTo` so all eleven surfaces' boxes
 * can be asserted in one diff; PostGIS answers in float8 and the corners come
 * back a few ulps off the literals they were built from.
 */
function rounded(extent: MapExtent | null | undefined): MapExtent | null {
	if (extent === null || extent === undefined) {
		return null;
	}

	return {
		west: round(extent.west),
		south: round(extent.south),
		east: round(extent.east),
		north: round(extent.north),
	};
}

function round(degrees: number): number {
	return Math.round(degrees * 10_000) / 10_000;
}

function sortedIds(rows: ReadonlyArray<{ id: string }> | undefined): string[] {
	return (rows ?? []).map((row) => row.id).sort();
}

/**
 * One property of a tile's features, keyed by the feature's id.
 *
 * The tile is the only place the map's copy of the status can be read, and it
 * arrives as an MVT property rather than a column.
 */
function featureProperty(
	tile: Uint8Array,
	layerName: string,
	property: string,
): ReadonlyMap<string, string> {
	const layer = new VectorTile(new PbfReader(tile)).layers[layerName];
	if (layer === undefined) {
		throw new Error(`Tile carries no ${layerName} layer.`);
	}

	return new Map(
		Array.from({ length: layer.length }, (_unused, index) => {
			const { properties } = layer.feature(index);
			return [String(properties.id), String(properties[property])] as const;
		}),
	);
}

/**
 * The answers for the six status rows, keyed by the case each one stands for.
 *
 * Both readers also return the rows the shared seed put there, which this drops:
 * they are what the surface tests assert on, and a failure here should name the
 * case that broke rather than a UUID.
 */
function byStatusCase(answers: ReadonlyMap<string, string>): Record<string, string | undefined> {
	return Object.fromEntries(
		Object.keys(mapSurfaceStatusCollections).map((name) => [
			name,
			answers.get(mapSurfaceStatusCollectionIds[name as keyof typeof mapSurfaceStatusCollections]),
		]),
	);
}

/**
 * The ids a tile's features carry, sorted.
 *
 * Decoded rather than compared as bytes because two of these tilesets have no
 * `ORDER BY` — their row order, and so their delta-encoded geometry, is
 * genuinely unstable between runs (#73).
 */
function featureIds(tile: Uint8Array | undefined, layerName: string): string[] {
	if (tile === undefined || tile.byteLength === 0) {
		return [];
	}

	const layer = new VectorTile(new PbfReader(tile)).layers[layerName];
	if (layer === undefined) {
		throw new Error(`Tile carries no ${layerName} layer.`);
	}

	return Array.from({ length: layer.length }, (_unused, index) =>
		String(layer.feature(index).properties.id),
	).sort();
}
