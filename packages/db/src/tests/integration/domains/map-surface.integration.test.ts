import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { type Kysely, sql } from 'kysely';
import { PbfReader } from 'pbf';
import { expect, it } from 'vitest';
import { getRequestedControlActionDisplayRowById } from '../../../domains/control-operations-map.js';
import type { MapExtent } from '../../../domains/map-extent.js';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import { MAP_TILE_ENCODING } from '../../../domains/map-tile.js';
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
	mapSurfaceSplitHabitatIds,
	mapSurfaceStampedCollectionIds,
	mapSurfaceStampedTimeZone,
	mapSurfaceStampedTypedDay,
	mapSurfaceStatusCollectionIds,
	mapSurfaceStatusCollections,
	seedLateCollection,
	seedMapSurfaces,
	seedSplitHabitats,
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
		input: { organizationId: string; timeZone: string; id: string },
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
		tile: MAP_SURFACES.habitats.getTile,
		extent: MAP_SURFACES.habitats.getExtent,
		boundsPage: MAP_SURFACES.habitats.listByBounds,
		byId: MAP_SURFACES.habitats.getById,
	},
	{
		name: 'inspection',
		layer: 'inspections',
		tile: MAP_SURFACES.inspections.getTile,
		extent: MAP_SURFACES.inspections.getExtent,
		boundsPage: MAP_SURFACES.inspections.listByBounds,
		byId: MAP_SURFACES.inspections.getById,
	},
	{
		name: 'sample',
		layer: 'samples',
		tile: MAP_SURFACES.samples.getTile,
		extent: MAP_SURFACES.samples.getExtent,
		boundsPage: MAP_SURFACES.samples.listByBounds,
		byId: MAP_SURFACES.samples.getById,
	},
	{
		name: 'trap',
		layer: 'traps',
		tile: MAP_SURFACES.traps.getTile,
		extent: MAP_SURFACES.traps.getExtent,
		page: MAP_SURFACES.traps.listPage,
		byId: MAP_SURFACES.traps.getById,
	},
	{
		name: 'collection',
		layer: 'collections',
		tile: MAP_SURFACES.collections.getTile,
		extent: MAP_SURFACES.collections.getExtent,
		page: MAP_SURFACES.collections.listPage,
		byId: MAP_SURFACES.collections.getById,
	},
	{
		name: 'application',
		layer: 'chemical',
		tile: MAP_SURFACES.chemical.getTile,
		extent: MAP_SURFACES.chemical.getExtent,
		page: MAP_SURFACES.chemical.listPage,
		byId: MAP_SURFACES.chemical.getById,
	},
	{
		name: 'sourceReduction',
		layer: 'source-reduction',
		tile: MAP_SURFACES['source-reduction'].getTile,
		extent: MAP_SURFACES['source-reduction'].getExtent,
		page: MAP_SURFACES['source-reduction'].listPage,
		byId: MAP_SURFACES['source-reduction'].getById,
	},
	{
		name: 'biocontrol',
		layer: 'biocontrol',
		tile: MAP_SURFACES.biocontrol.getTile,
		extent: MAP_SURFACES.biocontrol.getExtent,
		page: MAP_SURFACES.biocontrol.listPage,
		byId: MAP_SURFACES.biocontrol.getById,
	},
	{
		name: 'outreach',
		layer: 'outreach',
		tile: MAP_SURFACES.outreach.getTile,
		extent: MAP_SURFACES.outreach.getExtent,
		page: MAP_SURFACES.outreach.listPage,
		byId: MAP_SURFACES.outreach.getById,
	},
	// No explorer, no tile, no list — the queue is read from the Electric shape
	// and this exists only to hand the detail card the geometry that shape omits.
	{ name: 'requestedControlAction', byId: getRequestedControlActionDisplayRowById },
	// Same shape, and for the same reason: the registrations explorer draws each
	// buffer from the centroid the Electric shape carries, and only the edit form
	// needs the shape itself back.
	{ name: 'notificationRegistration', byId: getNotificationRegistrationGeometryById },
	{
		name: 'address',
		layer: 'addresses',
		tile: MAP_SURFACES.addresses.getTile,
		extent: MAP_SURFACES.addresses.getExtent,
	},
	{
		name: 'region',
		layer: 'regions',
		tile: MAP_SURFACES.regions.getTile,
		extent: MAP_SURFACES.regions.getExtent,
		padding: boxPadding,
	},
];

const page = { limit: 50, offset: 0 };

// --- the shape the Split gesture writes --------------------------------------
//
// Split cuts one part of a drawn shape in two and puts both pieces back, still
// sitting on the line they were cut along. OGC calls that an invalid
// MultiPolygon, nothing in this schema refuses it, and the row stores (#518).
// `readMapTile` runs every row through `ST_AsMVTGeom`, so what that call does
// to the shape is what decides whether a split record draws at all.
//
// The membership answer for this shape is pinned in the corpus. This is the
// other half, and it was the open question when #518 was filed: a null geometry
// here would take the record off the map with nothing on screen to say why.
//
// Three shapes, in the tile every other case in this file frames, encoded at
// `MAP_TILE_ENCODING` so the question is asked at the values the map runs on
// rather than at a copy of them. All three sit well inside the tile, so nothing
// is clipped and the two areas are comparable.
//
// The call is written out here rather than reached through `MAP_SURFACES.habitats.getTile`
// because the questions are about the geometry `ST_AsMVTGeom` returns, and by
// the time a tile comes back that geometry has been through `ST_AsMVT` and no
// `st_isvalid` or `st_area` can be asked of it. The cost is that the transform
// and the envelope around the call are a second copy of `readMapTile`'s. What
// holds those to each other is `map-surface-sql.test.ts`, which pins the shipped
// query text for all forty-one reads, so a changed SRID or envelope there is a
// snapshot diff rather than a case that stays green while the map breaks.
//
// The case below it seeds the same two shapes as habitats and reads them back
// through `MAP_SURFACES.habitats.getTile`, decoding the tile rather than the geometry. That
// one builds no envelope of its own, so between them the shapes are asked both
// what the encoder does to them and what the shipped reader returns (#659).

/** A lot inside `mapSurfacePlace.tile`, drawn in one piece. */
const UNCUT_LOT = 'POLYGON((-90.51 35.49, -90.49 35.49, -90.49 35.51, -90.51 35.51, -90.51 35.49))';

/** The same lot cut down the middle, both pieces keeping longitude -90.50. */
const SPLIT_LOT =
	'MULTIPOLYGON(((-90.51 35.49, -90.5 35.49, -90.5 35.51, -90.51 35.51, -90.51 35.49)),' +
	'((-90.5 35.49, -90.49 35.49, -90.49 35.51, -90.5 35.51, -90.5 35.49)))';

/** The cut lot with a third piece east of it, sharing nothing with either half. */
const SPLIT_LOT_AND_ONE_MORE =
	'MULTIPOLYGON(((-90.51 35.49, -90.5 35.49, -90.5 35.51, -90.51 35.51, -90.51 35.49)),' +
	'((-90.5 35.49, -90.49 35.49, -90.49 35.51, -90.5 35.51, -90.5 35.49)),' +
	'((-90.47 35.49, -90.46 35.49, -90.46 35.51, -90.47 35.51, -90.47 35.49)))';

/** The three shapes the encoder is asked about. A typo fails `tsc` rather than at runtime. */
type EncodedShapeName = 'uncut' | 'split' | 'split-and-disjoint';

interface EncodedShapeRow {
	readonly id: EncodedShapeName;
	readonly stored_valid: boolean;
	readonly encoded_null: boolean;
	readonly encoded_type: string | null;
	readonly encoded_valid: boolean | null;
	readonly encoded_parts: number | null;
	readonly encoded_area: number | null;
}

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
						(
							await surface.byId?.(db, {
								organizationId: mapSurfaceOrganizationIds.own,
								timeZone: mapSurfaceTimeZone,
								id,
							})
						)?.id;

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
				const result = await MAP_SURFACES.collections.listPage(db, {
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

			const onTheTypedDay = await MAP_SURFACES.collections.listPage(db, {
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
				MAP_SURFACES.collections.listPage(db, {
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

			const drawn = await MAP_SURFACES.collections.getTile(db, {
				...mapSurfacePlace.tile,
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
			});
			const listed = await MAP_SURFACES.collections.listPage(db, {
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
			const opened = await MAP_SURFACES.samples.getById(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
				id: mapSurfaceSampleOnDeletedInspectionId,
			});

			expect(opened).toBeUndefined();
		});
	});

	it('draws a split record the way it draws an uncut one', async () => {
		await withTestDb(async ({ db }) => {
			const encoded = await sql<EncodedShapeRow>`
				with bounds as (
					select st_tileenvelope(
						${mapSurfacePlace.tile.z},
						${mapSurfacePlace.tile.x},
						${mapSurfacePlace.tile.y}
					) as geom_3857
				),
				shapes(id, geom) as (
					values
						('uncut', st_setsrid(st_geomfromtext(${UNCUT_LOT}::text), 4326)),
						('split', st_setsrid(st_geomfromtext(${SPLIT_LOT}::text), 4326)),
						('split-and-disjoint', st_setsrid(st_geomfromtext(${SPLIT_LOT_AND_ONE_MORE}::text), 4326))
				)
				select
					shapes.id,
					st_isvalid(shapes.geom) as stored_valid,
					encoded.geom is null as encoded_null,
					geometrytype(encoded.geom) as encoded_type,
					st_isvalid(encoded.geom) as encoded_valid,
					st_numgeometries(encoded.geom) as encoded_parts,
					st_area(encoded.geom) as encoded_area
				from shapes
				cross join bounds
				cross join lateral (
					select st_asmvtgeom(
						st_transform(shapes.geom, 3857),
						bounds.geom_3857,
						extent => ${MAP_TILE_ENCODING.extent},
						buffer => ${MAP_TILE_ENCODING.buffer}
					) as geom
				) as encoded
			`.execute(db);

			const uncut = encodedShape(encoded.rows, 'uncut');
			const split = encodedShape(encoded.rows, 'split');
			const splitAndDisjoint = encodedShape(encoded.rows, 'split-and-disjoint');

			// Both cut shapes are invalid where they sit, and the uncut one is not.
			// Everything below is vacuous without that: a Split that had started
			// producing valid geometry would make this a test of nothing.
			expect(uncut.stored_valid).toBe(true);
			expect(split.stored_valid).toBe(false);
			expect(splitAndDisjoint.stored_valid).toBe(false);
			// The area the cut shapes are measured against, so the comparison below
			// cannot pass by both sides being null.
			expect(uncut.encoded_area).toBeGreaterThan(0);

			// The encoder dissolves the shared edge. A null here would drop the
			// record's geometry from the layer with nothing on screen to say why,
			// and an area that disagreed would mean the cut ate ground.
			expect(split.encoded_null).toBe(false);
			expect(split.encoded_type).toBe('POLYGON');
			expect(split.encoded_valid).toBe(true);
			expect(split.encoded_area).toBe(uncut.encoded_area);

			// Dissolving reaches only as far as the pieces that touch. A part that
			// is genuinely somewhere else survives as its own, so a record split
			// once and pulled apart twice still draws as two.
			expect(splitAndDisjoint.encoded_type).toBe('MULTIPOLYGON');
			expect(splitAndDisjoint.encoded_valid).toBe(true);
			expect(splitAndDisjoint.encoded_parts).toBe(2);
		});
	});

	it('hands a split record back through the tile reader with its parts intact', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await seedSplitHabitats(db, {
				split: SPLIT_LOT,
				splitAndDisjoint: SPLIT_LOT_AND_ONE_MORE,
			});

			// The reader builds the transform and the envelope. Nothing here does,
			// which is the whole of this case: the one above asks `ST_AsMVTGeom` a
			// question through an encoder call it writes itself, and what that call
			// agrees with is a copy rather than the shipped read.
			const tile = await MAP_SURFACES.habitats.getTile(db, {
				...mapSurfacePlace.tile,
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
			});

			const drawn = featureGeometries(tile, 'habitats', mapSurfacePlace.tile);

			// Both cut habitats are in the layer, beside the shared seed's uncut one.
			// A record dropped on the way through the encoder would leave the other
			// assertions with nothing to read.
			expect([...drawn.keys()].sort()).toEqual(
				[
					mapSurfaceRowIds.habitat.inside,
					mapSurfaceSplitHabitatIds.split,
					mapSurfaceSplitHabitatIds.splitAndDisjoint,
				].sort(),
			);

			// The cut halves come back dissolved into one drawable part, and the
			// piece that sits apart comes back as its own. This is what the inline
			// case cannot ask: it holds the geometry before `ST_AsMVT` and this
			// holds the tile after it.
			expect(decodedShape(drawn, mapSurfaceSplitHabitatIds.split)).toEqual({
				type: 'Polygon',
				parts: 1,
			});
			expect(decodedShape(drawn, mapSurfaceSplitHabitatIds.splitAndDisjoint)).toEqual({
				type: 'MultiPolygon',
				parts: 2,
			});

			// Every ring closes over ground. A part collapsed to a line still
			// encodes to bytes and still counts as a part, so the count above is
			// only worth reading with this beside it.
			for (const id of Object.values(mapSurfaceSplitHabitatIds)) {
				expect(Math.min(...ringLengths(drawn, id))).toBeGreaterThanOrEqual(4);
			}
		});
	});
});

/** The geometry a decoded feature carries, whatever GeoJSON shape it turns out to be. */
type DecodedGeometry = ReturnType<VectorTileFeature['toGeoJSON']>['geometry'];

/** What a decoded record draws as: its GeoJSON type, and how many parts it has. */
interface DecodedShape {
	readonly type: string;
	readonly parts: number;
}

/**
 * The geometry each of a tile's features decodes to, keyed by its id property.
 *
 * `featureIds` next door reads properties, which is all the scope questions
 * need. A record with more than one part can only be asked about through its
 * geometry, and `toGeoJSON` is what turns the tile's encoded rings back into
 * parts that can be counted.
 */
function featureGeometries(
	tile: Uint8Array,
	layerName: string,
	place: { readonly z: number; readonly x: number; readonly y: number },
): ReadonlyMap<string, DecodedGeometry> {
	const layer = new VectorTile(new PbfReader(tile)).layers[layerName];
	if (layer === undefined) {
		throw new Error(`Tile carries no ${layerName} layer.`);
	}

	return new Map(
		Array.from({ length: layer.length }, (_unused, index) => {
			const feature = layer.feature(index);
			const { geometry } = feature.toGeoJSON(place.x, place.y, place.z);
			return [String(feature.properties.id), geometry] as const;
		}),
	);
}

/** One decoded record's shape, throwing rather than letting a missing feature read as null. */
function decodedShape(geometries: ReadonlyMap<string, DecodedGeometry>, id: string): DecodedShape {
	const geometry = polygonal(geometries, id);
	return {
		type: geometry.type,
		parts: geometry.type === 'Polygon' ? 1 : geometry.coordinates.length,
	};
}

/** How many positions each of a decoded record's rings holds. */
function ringLengths(geometries: ReadonlyMap<string, DecodedGeometry>, id: string): number[] {
	const geometry = polygonal(geometries, id);
	const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

	return parts.flatMap((rings) => rings.map((ring) => ring.length));
}

function polygonal(
	geometries: ReadonlyMap<string, DecodedGeometry>,
	id: string,
): Extract<DecodedGeometry, { type: 'Polygon' | 'MultiPolygon' }> {
	const geometry = geometries.get(id);
	if (geometry === undefined) {
		throw new Error(`The tile drew nothing for ${id}.`);
	}
	if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
		throw new Error(`${id} drew as ${geometry.type} rather than as an area.`);
	}

	return geometry;
}

/** One encoded shape by name, throwing rather than letting a lost row read as null. */
function encodedShape(rows: readonly EncodedShapeRow[], id: EncodedShapeName): EncodedShapeRow {
	const row = rows.find((candidate) => candidate.id === id);
	if (row === undefined) {
		throw new Error(`The encoder answered nothing for ${id}.`);
	}
	return row;
}

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
