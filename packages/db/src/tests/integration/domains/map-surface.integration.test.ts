import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { type Kysely, sql } from 'kysely';
import { PbfReader } from 'pbf';
import { expect, it } from 'vitest';
import type { CollectionMapFilters, TrapMapFilters } from '../../../domains/adult-surveillance.js';
import {
	type ApplicationMapFilters,
	type BiocontrolMapFilters,
	getRequestedControlActionDisplayRowById,
	type OutreachMapFilters,
	type SourceReductionMapFilters,
} from '../../../domains/control-operations-map.js';
import type { AddressMvtTileFilters } from '../../../domains/foundation-geography.js';
import type { HabitatMvtTileFilters } from '../../../domains/habitats.js';
import {
	type InspectionMvtTileFilters,
	type SampleListFilters,
	sampleStatusValues,
} from '../../../domains/larval-surveillance.js';
import type { MapExtent } from '../../../domains/map-extent.js';
import type { MapRecordSurfaceReaders } from '../../../domains/map-surface.js';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import { MAP_TILE_ENCODING } from '../../../domains/map-tile.js';
import {
	getNotificationRegistrationGeometryById,
	type ServiceRequestMapFilters,
} from '../../../domains/public-engagement-map.js';
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
import { seedUntreatedWorld, UNTREATED_BOUNDS, UNTREATED_TIME_ZONE } from './untreated-world.js';

// --- what the map surfaces actually answer -----------------------------------
//
// `map-surface-sql.test.ts` compiles all forty-seven map reads and pins the SQL,
// which proves ADR 0008's organization and soft-delete predicates are written.
// It pins text, not execution: no read in this package has ever been run
// against Postgres, so a predicate on the wrong alias, a join that outlives its
// parent's delete, or an envelope that frames the wrong corner would keep that
// suite green and hand one organization another organization's records.
//
// This runs every one of them. The seed puts each surface's live record on top
// of a deleted one and a neighbouring organization's, so a read that lost its
// scope answers with three where one was seeded — the returned id set is the
// whole assertion, and it is compared for all fourteen surfaces at once so a
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
	/** The paged list, which every surface with a result rail reads by box. */
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
		boundsPage: MAP_SURFACES.traps.listByBounds,
		byId: MAP_SURFACES.traps.getById,
	},
	{
		name: 'collection',
		layer: 'collections',
		tile: MAP_SURFACES.collections.getTile,
		extent: MAP_SURFACES.collections.getExtent,
		boundsPage: MAP_SURFACES.collections.listByBounds,
		byId: MAP_SURFACES.collections.getById,
	},
	{
		name: 'application',
		layer: 'chemical',
		tile: MAP_SURFACES.chemical.getTile,
		extent: MAP_SURFACES.chemical.getExtent,
		boundsPage: MAP_SURFACES.chemical.listByBounds,
		byId: MAP_SURFACES.chemical.getById,
	},
	{
		name: 'sourceReduction',
		layer: 'source-reduction',
		tile: MAP_SURFACES['source-reduction'].getTile,
		extent: MAP_SURFACES['source-reduction'].getExtent,
		boundsPage: MAP_SURFACES['source-reduction'].listByBounds,
		byId: MAP_SURFACES['source-reduction'].getById,
	},
	{
		name: 'biocontrol',
		layer: 'biocontrol',
		tile: MAP_SURFACES.biocontrol.getTile,
		extent: MAP_SURFACES.biocontrol.getExtent,
		boundsPage: MAP_SURFACES.biocontrol.listByBounds,
		byId: MAP_SURFACES.biocontrol.getById,
	},
	{
		name: 'outreach',
		layer: 'outreach',
		tile: MAP_SURFACES.outreach.getTile,
		extent: MAP_SURFACES.outreach.getExtent,
		boundsPage: MAP_SURFACES.outreach.listByBounds,
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
		boundsPage: MAP_SURFACES.addresses.listByBounds,
		byId: MAP_SURFACES.addresses.getById,
	},
	{
		name: 'region',
		layer: 'regions',
		tile: MAP_SURFACES.regions.getTile,
		extent: MAP_SURFACES.regions.getExtent,
		padding: boxPadding,
	},
	{
		name: 'serviceRequest',
		layer: 'service-requests',
		tile: MAP_SURFACES['service-requests'].getTile,
		extent: MAP_SURFACES['service-requests'].getExtent,
		boundsPage: MAP_SURFACES['service-requests'].listByBounds,
		byId: MAP_SURFACES['service-requests'].getById,
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
// query text for all forty-seven reads, so a changed SRID or envelope there is a
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

	it('lists this organization’s live records inside the box, and no others', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);

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

			// `inside` and nothing else: `outside` is this organization's live record
			// off screen, which is the half the six control and adult surfaces used
			// to list behind a map that could not draw it (#920). Deleted and the
			// other organization's sit on top of `inside` and never come back.
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

	// The one filtered read here, because the address search is the predicate
	// the explorer's list used to apply in the browser over five fields and the
	// tiles applied over one. Both go through this predicate now (#962), so what
	// it matches is what the map draws and the rail lists. The seed's display
	// name is `100 Main St`, with every other line null: a match on it comes
	// back, a term nothing carries does not, and a null line does not null the
	// whole because `concat_ws` skips it.
	it('pages the addresses in the box that match the search', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = mapSurfaceRowIds.address;
			const read = async (search: string) =>
				MAP_SURFACES.addresses.listByBounds(db, {
					organizationId: mapSurfaceOrganizationIds.own,
					timeZone: mapSurfaceTimeZone,
					bounds: mapSurfacePlace.bounds,
					filters: { search },
					...page,
				});

			const matched = await read('main');
			const unmatched = await read('elm');

			expect({ ids: sortedIds(matched.rows), total: matched.total }).toEqual({
				ids: [ids.inside],
				total: 1,
			});
			expect({ ids: sortedIds(unmatched.rows), total: unmatched.total }).toEqual({
				ids: [],
				total: 0,
			});
		});
	});

	// The Habitats rail pages its order out of Postgres, and under the default
	// collation `Culvert 100` sorted between `Culvert 1` and `Culvert 2`.
	// `natural_sort` reads the digits as a number, so the seeded `Culvert 12`
	// lands between the two names written here rather than after both.
	it('pages habitats with the numbers in their names read as numbers', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await sql`
				insert into habitats (id, organization_id, geom, habitat_type_id, habitat_name, description)
				select gen_random_uuid(), h.organization_id, h.geom, h.habitat_type_id, name, h.description
				from habitats h, unnest(array['Culvert 100', 'Culvert 9']) as name
				where h.id = ${mapSurfaceRowIds.habitat.inside}
			`.execute(db);

			const result = await MAP_SURFACES.habitats.listByBounds(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
				bounds: mapSurfacePlace.bounds,
				...page,
			});

			expect(result.rows.map((row) => row.habitatName)).toEqual([
				'Culvert 9',
				'Culvert 12',
				'Culvert 100',
			]);
		});
	});

	// The three filters the service-request explorer used to apply in the browser
	// over the whole Organization's rows, run against Postgres on one row (#963),
	// and the date pair the period-in-review count links write over
	// `request_date`, which the seed dates in March 2026 (a JS `Date` into a
	// `date` column lands on the 14th or the 15th by the driver's zone, so the
	// bounds below leave a day either side). The seed's request has no
	// number, so the title half of the search has nothing to match until this
	// case gives it one; `#12` then finds it the way typing that into the rail
	// did, a word from its details does too, and a term nothing carries does not.
	// Status reads `closed_at`, so the same row is the answer to `isOpen: true`
	// and then to `isOpen: false` once it is stamped. The tag filter reads
	// `tag_items` under the snake_case `service_request`, and a tag the row does
	// not carry matches nothing.
	it('pages the service requests in the box that match the status, search, tag and dates', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = mapSurfaceRowIds.serviceRequest;
			const tagId = '00000000-0000-4000-8000-000000009901';
			const otherTagId = '00000000-0000-4000-8000-000000009902';
			await db
				.updateTable('service_requests')
				.set({ display_name: 12 })
				.where('id', '=', ids.inside)
				.execute();
			await db
				.insertInto('tags')
				.values([
					{ id: tagId, organization_id: mapSurfaceOrganizationIds.own, tag_name: 'Drainage' },
					{ id: otherTagId, organization_id: mapSurfaceOrganizationIds.own, tag_name: 'Noise' },
				])
				.execute();
			await db
				.insertInto('tag_items')
				.values({
					tag_id: tagId,
					organization_id: mapSurfaceOrganizationIds.own,
					entity_type: 'service_request',
					entity_id: ids.inside,
				})
				.execute();

			const read = async (filters: {
				readonly isOpen?: boolean;
				readonly search?: string;
				readonly tagIds?: readonly string[];
				readonly dateFrom?: string;
				readonly dateTo?: string;
				readonly overdueBefore?: string;
			}) => {
				const result = await MAP_SURFACES['service-requests'].listByBounds(db, {
					organizationId: mapSurfaceOrganizationIds.own,
					timeZone: mapSurfaceTimeZone,
					bounds: mapSurfacePlace.bounds,
					filters,
					...page,
				});
				return { ids: sortedIds(result.rows), total: result.total };
			};
			const found = { ids: [ids.inside], total: 1 };
			const nothing = { ids: [], total: 0 };

			expect(await read({ isOpen: true })).toEqual(found);
			expect(await read({ isOpen: false })).toEqual(nothing);
			expect(await read({ search: '#12' })).toEqual(found);
			expect(await read({ search: 'garage' })).toEqual(found);
			expect(await read({ search: 'elm' })).toEqual(nothing);
			expect(await read({ tagIds: [tagId] })).toEqual(found);
			expect(await read({ tagIds: [otherTagId] })).toEqual(nothing);
			expect(await read({ dateFrom: '2026-03-01', dateTo: '2026-03-31' })).toEqual(found);
			expect(await read({ dateFrom: '2026-03-16' })).toEqual(nothing);
			expect(await read({ dateTo: '2026-03-13' })).toEqual(nothing);
			// Overdue is open and received before the cut-off, inside any window.
			expect(await read({ overdueBefore: '2026-03-20' })).toEqual(found);
			expect(await read({ overdueBefore: '2026-03-13' })).toEqual(nothing);
			expect(await read({ overdueBefore: '2026-03-20', dateFrom: '2026-03-16' })).toEqual(nothing);

			await db
				.updateTable('service_requests')
				.set({ closed_at: new Date('2026-03-20T15:00:00.000Z') })
				.where('id', '=', ids.inside)
				.execute();

			expect(await read({ isOpen: true })).toEqual(nothing);
			expect(await read({ isOpen: false })).toEqual(found);
			expect(await read({ overdueBefore: '2026-03-20' })).toEqual(nothing);
		});
	});

	// The rail opens newest first and can be turned around to work the queue from
	// the request that has waited longest. A second request thirty days older than
	// the seeded one is enough to tell the two orders apart.
	it('pages the service requests oldest first when asked to', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = mapSurfaceRowIds.serviceRequest;
			const older = '00000000-0000-4000-8000-000000009903';
			await sql`
				insert into service_requests
					(id, organization_id, geom, request_date, intake_type, details, contact_id, address_id)
				select ${older}, organization_id, geom, request_date - 30, intake_type, details,
					contact_id, address_id
				from service_requests
				where id = ${ids.inside}
			`.execute(db);

			const read = async (oldestFirst: boolean) =>
				(
					await MAP_SURFACES['service-requests'].listByBounds(db, {
						organizationId: mapSurfaceOrganizationIds.own,
						timeZone: mapSurfaceTimeZone,
						bounds: mapSurfacePlace.bounds,
						filters: oldestFirst ? { oldestFirst } : {},
						...page,
					})
				).rows.map((row) => row.id);

			expect(await read(false)).toEqual([ids.inside, older]);
			expect(await read(true)).toEqual([older, ids.inside]);
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
				const result = await MAP_SURFACES.collections.listByBounds(db, {
					organizationId: mapSurfaceOrganizationIds.own,
					timeZone,
					bounds: mapSurfacePlace.bounds,
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

			const onTheTypedDay = await MAP_SURFACES.collections.listByBounds(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceStampedTimeZone,
				bounds: mapSurfacePlace.bounds,
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
				MAP_SURFACES.collections.listByBounds(db, {
					organizationId: mapSurfaceOrganizationIds.own,
					timeZone: "UTC'; drop table collections --",
					bounds: mapSurfacePlace.bounds,
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
			const listed = await MAP_SURFACES.collections.listByBounds(db, {
				organizationId: mapSurfaceOrganizationIds.own,
				timeZone: mapSurfaceTimeZone,
				bounds: mapSurfacePlace.bounds,
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
 * Compared by value rather than with `toBeCloseTo` so all twelve surfaces' boxes
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

// --- the in-view summary -----------------------------------------------------
//
// Over 100 habitats in view the Habitats rail draws grouped counts instead of
// rows (#1244). The summary and the page are two reads, so the one thing that
// must hold is that they count the same set: the summary's total is compared
// with the page's under every filter a grouping button writes, and each
// grouping's counts add up to that total. The world is the untreated suite's,
// so the untreated grouping is read against the same eight habitats that suite
// asserts by id.
describeDbIntegration('habitat summary against Postgres', () => {
	it('counts the habitats the page counts, grouped by each declared grouping', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedUntreatedWorld(db);
			const typed = world.untreated.slice(0, 2);
			const type = await db
				.insertInto('habitat_types')
				.values({ organization_id: world.organizationId, name: 'Tire' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			await db
				.updateTable('habitats')
				.set({ habitat_type_id: type.id })
				.where('id', 'in', typed)
				.execute();

			const context = {
				organizationId: world.organizationId,
				timeZone: UNTREATED_TIME_ZONE,
				bounds: UNTREATED_BOUNDS,
			};
			const filterSets: readonly HabitatMvtTileFilters[] = [
				{},
				{ untreatedOnly: true },
				{ isActive: true },
				{ isActive: false },
				{ isInaccessible: true },
				{ isInaccessible: false },
				{ habitatTypeIds: [type.id] },
			];

			const answers = await Promise.all(
				filterSets.map(async (filters) => {
					const summary = await MAP_SURFACES.habitats.summarizeByBounds(db, {
						...context,
						filters,
					});
					const listed = await MAP_SURFACES.habitats.listByBounds(db, {
						...context,
						filters,
						...page,
					});
					return { summary, pageTotal: listed.total };
				}),
			);

			for (const { summary, pageTotal } of answers) {
				expect(summary.total).toBe(pageTotal);
				for (const groups of Object.values(summary.groups)) {
					expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(summary.total);
				}
			}

			const unfiltered = answers[0]?.summary;
			expect(Object.keys(unfiltered?.groups ?? {}).sort()).toEqual([
				'habitatTypeId',
				'isActive',
				'isInaccessible',
				'untreated',
			]);
			expect(unfiltered?.groups.untreated).toContainEqual({
				value: true,
				count: world.untreated.length,
			});
			expect(unfiltered?.groups.habitatTypeId).toContainEqual({ value: type.id, count: 2 });
			// Largest first, so a client can take the top five as they come.
			for (const groups of Object.values(unfiltered?.groups ?? {})) {
				const counts = groups.map((group) => group.count);
				expect(counts).toEqual([...counts].sort((a, b) => b - a));
			}

			// Filtered to untreated, every habitat in the box is on the true side.
			expect(answers[1]?.summary.groups.untreated).toEqual([
				{ value: true, count: world.untreated.length },
			]);
		});
	});

	it('answers a box with nothing in it with a zero total and empty groupings', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedUntreatedWorld(db);

			const summary = await MAP_SURFACES.habitats.summarizeByBounds(db, {
				organizationId: world.organizationId,
				timeZone: UNTREATED_TIME_ZONE,
				bounds: { west: 10, south: 10, east: 11, north: 11 },
			});

			expect(summary).toEqual({
				total: 0,
				groups: { habitatTypeId: [], isActive: [], isInaccessible: [], untreated: [] },
			});
		});
	});
});

// Over 100 inspections in view the Inspections rail draws the same summary
// (#1369). The seeded world's one live inspection in the box is joined by five
// more that differ on each grouping, and the summary's total is compared with
// the page's under every filter a grouping button writes.
describeDbIntegration('inspection summary against Postgres', () => {
	it('counts the inspections the page counts, grouped by each declared grouping', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const { typeId, inspectorId } = await seedInspectionVariety(db);

			const filterSets: readonly InspectionMvtTileFilters[] = [
				{},
				{ isWet: true },
				{ isWet: false },
				{ densities: ['heavy'] },
				{ densities: ['heavy', 'light'] },
				{ positiveOnly: true },
				{ habitatTypeIds: [typeId] },
				{ inspectedByProfileIds: [inspectorId] },
				{ dateFrom: '2026-03-16' },
			];
			const answers = await Promise.all(
				filterSets.map((filters) => summaryAndPage(db, MAP_SURFACES.inspections, filters)),
			);

			for (const { summary, pageTotal } of answers) {
				expect(summary.total).toBe(pageTotal);
				for (const groups of Object.values(summary.groups)) {
					expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(summary.total);
				}
			}

			expect(answers[0]?.summary).toEqual({
				total: 6,
				groups: {
					isWet: [
						{ value: true, count: 5 },
						{ value: false, count: 1 },
					],
					density: expect.arrayContaining([
						{ value: 'heavy', count: 2 },
						{ value: 'light', count: 2 },
						{ value: 'none', count: 1 },
						{ value: null, count: 1 },
					]),
					// A Positive Inspection reads abundance, not life stages (#1422).
					// The two `light` rows carry no stage flag and are positive on
					// their band; under the life-stage rule this was 2 true, 4 false.
					positive: [
						{ value: true, count: 4 },
						{ value: false, count: 2 },
					],
					habitatTypeId: expect.arrayContaining([
						{ value: typeId, count: 3 },
						{ value: null, count: 3 },
					]),
					inspectedBy: expect.arrayContaining([
						{ value: inspectorId, count: 3 },
						{ value: null, count: 3 },
					]),
				},
			});
			// Outside the date window nothing is counted, and every grouping is still a key.
			expect(answers[8]?.summary).toEqual({
				total: 0,
				groups: { isWet: [], density: [], positive: [], habitatTypeId: [], inspectedBy: [] },
			});
		});
	});
});

/**
 * Five more live inspections beside the seeded `inside` one, each differing on
 * one grouping: a dry one, two heavy ones that found larvae, and two carrying
 * the seeded inspection's type or inspector where the others carry none.
 */
async function seedInspectionVariety(
	db: Kysely<SimmerDatabase>,
): Promise<{ readonly typeId: string; readonly inspectorId: string }> {
	const inside = await db
		.selectFrom('inspections')
		.select(['habitat_type_id', 'inspected_by_profile_id'])
		.where('id', '=', mapSurfaceRowIds.inspection.inside)
		.executeTakeFirstOrThrow();
	const typeId = String(inside.habitat_type_id);
	const inspectorId = String(inside.inspected_by_profile_id);
	const base = {
		organization_id: mapSurfaceOrganizationIds.own,
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
		inspection_date: new Date('2026-03-15T00:00:00.000Z'),
	};
	await db
		.insertInto('inspections')
		.values([
			{ ...base, is_wet: false, habitat_type_id: typeId },
			{ ...base, is_wet: true, density: 'heavy', has_pupae: true },
			{ ...base, is_wet: true, density: 'heavy', has_eggs: true },
			{
				...base,
				is_wet: true,
				density: 'light',
				habitat_type_id: typeId,
				inspected_by_profile_id: inspectorId,
			},
			{ ...base, is_wet: true, density: 'none', inspected_by_profile_id: inspectorId },
		])
		.execute();
	return { typeId, inspectorId };
}

/** The summary and the page's total for the seeded box under one filter set. */
async function summaryAndPage<TFilters>(
	db: Kysely<SimmerDatabase>,
	surface: Pick<MapRecordSurfaceReaders<TFilters, unknown>, 'summarizeByBounds' | 'listByBounds'>,
	filters: TFilters,
	timeZone = mapSurfaceTimeZone,
) {
	const input = {
		organizationId: mapSurfaceOrganizationIds.own,
		timeZone,
		bounds: mapSurfacePlace.bounds,
		filters,
	};
	const summary = await surface.summarizeByBounds(db, input);
	const listed = await surface.listByBounds(db, { ...input, ...page });
	return { summary, pageTotal: listed.total };
}

// Over 100 samples in view the Samples rail draws the same summary (#1370).
// The seeded world's one live sample in the box, which is awaiting, is joined
// by four more on the same inspection. Two statuses overlap on one of them and
// one carries two species, so the status and species counts can run past the
// total, and each is checked against the page its button narrows to.
describeDbIntegration('sample summary against Postgres', () => {
	it('counts the samples the page counts, by status, species and non-mosquito', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const { pipiens, restuans } = await seedSampleVariety(db);
			const read = (filters: SampleListFilters) =>
				summaryAndPage(db, MAP_SURFACES.samples, filters);

			const all = await read({});
			expect(all.pageTotal).toBe(5);
			expect(all.summary).toEqual({
				total: 5,
				groups: {
					status: expect.arrayContaining([
						{ value: 'identified', count: 2 },
						{ value: 'awaiting', count: 1 },
						{ value: 'zero_larvae', count: 1 },
						{ value: 'unidentifiable', count: 2 },
					]),
					species: [
						{ value: pipiens, count: 2 },
						{ value: restuans, count: 1 },
					],
					nonMosquito: [
						{ value: false, count: 4 },
						{ value: true, count: 1 },
					],
				},
				figures: { larvaeTotal: 10 },
			});
			expect(all.summary.groups.status).toHaveLength(4);

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string | boolean, SampleListFilters])[] = [
				...sampleStatusValues.map((status) => ['status', status, { status }] as const),
				['species', pipiens, { speciesIds: [pipiens] }],
				['species', restuans, { speciesIds: [restuans] }],
				['nonMosquito', true, { nonMosquitoOnly: true }],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			expect((await read({ speciesIds: [restuans] })).summary.figures).toEqual({
				larvaeTotal: 8,
			});
			// Outside the date window nothing is counted and nothing is added up.
			expect((await read({ dateFrom: '2026-03-16' })).summary).toEqual({
				total: 0,
				groups: { status: [], species: [], nonMosquito: [] },
				figures: { larvaeTotal: 0 },
			});
		});
	});
});

/**
 * Four more live samples on the seeded `inside` inspection: one carrying both
 * species and non-mosquito material, one carrying one species, one closed out
 * as zero larvae and unidentifiable at once, and one unidentifiable alone. Ten
 * larvae are identified across them.
 */
async function seedSampleVariety(
	db: Kysely<SimmerDatabase>,
): Promise<{ readonly pipiens: string; readonly restuans: string }> {
	const genus = await db
		.insertInto('genera')
		.values({ abbreviation: 'Cx', name: 'Culex' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const species = await db
		.insertInto('species')
		.values(
			['pipiens', 'restuans'].map((epithet) => ({
				genus_id: genus.id,
				epithet,
				display_name: `Culex ${epithet}`,
			})),
		)
		.returning(['id', 'epithet'])
		.execute();
	const idOf = (epithet: string) => {
		const row = species.find((candidate) => candidate.epithet === epithet);
		if (row === undefined) {
			throw new Error(`Expected the seeded species ${epithet}.`);
		}
		return row.id;
	};

	const base = {
		organization_id: mapSurfaceOrganizationIds.own,
		inspection_id: mapSurfaceRowIds.inspection.inside,
	};
	const [both, one] = await db
		.insertInto('samples')
		.values([
			{ ...base, has_non_mosquito: true },
			{ ...base },
			{ ...base, is_zero_larvae: true, unidentifiable_reason: 'Damaged' },
			{ ...base, unidentifiable_reason: 'Desiccated' },
		])
		.returning('id')
		.execute();
	if (both === undefined || one === undefined) {
		throw new Error('Expected the seeded samples back.');
	}

	const pipiens = idOf('pipiens');
	const restuans = idOf('restuans');
	const identified = {
		organization_id: mapSurfaceOrganizationIds.own,
		identified_at: new Date('2026-03-16T00:00:00.000Z'),
	};
	await db
		.insertInto('sample_species')
		.values([
			{ ...identified, sample_id: both.id, species_id: restuans, larvae_count: 3 },
			{ ...identified, sample_id: both.id, species_id: pipiens, larvae_count: 5 },
			{ ...identified, sample_id: one.id, species_id: pipiens, larvae_count: 2 },
		])
		.execute();
	return { pipiens, restuans };
}

// Over 100 service requests in view the Service Requests rail draws the same
// summary (#1371). The seeded world's one open request in the box is joined by
// three more: one open and carrying two Tags, one closed and carrying one of
// them, and one open with neither. A request with two Tags counts under both,
// so the Tag counts run past the total, and each status and Tag count is
// checked against the page its button narrows to.
describeDbIntegration('service request summary against Postgres', () => {
	it('counts the requests the page counts, by status, Tag and intake type', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const { drainage, noise, insideDate } = await seedServiceRequestVariety(db);
			const read = (filters: ServiceRequestMapFilters) =>
				summaryAndPage(db, MAP_SURFACES['service-requests'], filters);
			// The oldest open request is the one dated thirty days before the seed's,
			// counted to today in the organization's zone.
			const oldestOpenDays = daysBetween(addDays(insideDate, -30), todayIn(mapSurfaceTimeZone));

			const all = await read({});
			expect(all.pageTotal).toBe(4);
			expect(all.summary).toEqual({
				total: 4,
				groups: {
					status: [
						{ value: 'open', count: 3 },
						{ value: 'closed', count: 1 },
					],
					tagId: [
						{ value: drainage, count: 2 },
						{ value: noise, count: 1 },
					],
					intakeType: expect.arrayContaining([
						{ value: 'online', count: 1 },
						{ value: 'other', count: 1 },
						{ value: 'phone', count: 1 },
						{ value: 'walk-in', count: 1 },
					]),
				},
				figures: { oldestOpenDays },
			});
			expect(all.summary.groups.intakeType).toHaveLength(4);

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string, ServiceRequestMapFilters])[] = [
				['status', 'open', { isOpen: true }],
				['status', 'closed', { isOpen: false }],
				['tagId', drainage, { tagIds: [drainage] }],
				['tagId', noise, { tagIds: [noise] }],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			// Under Drainage the thirty-day request is still the oldest open one.
			// With only closed requests in view there is no oldest open request, so
			// the figure is left out rather than read as zero days.
			expect((await read({ tagIds: [drainage] })).summary.figures).toEqual({ oldestOpenDays });
			expect((await read({ isOpen: false })).summary.figures).toEqual({});
			expect((await read({ dateFrom: addDays(insideDate, 1) })).summary).toEqual({
				total: 0,
				groups: { status: [], tagId: [], intakeType: [] },
				figures: {},
			});
		});
	});
});

/**
 * Three more requests in the box beside the seeded open one, copied from it
 * with an earlier date: open and phoned in thirty days before with both Tags,
 * closed and walked in sixty days before with Drainage, and open with an
 * intake type of other ten days before with neither. The seeded one came in
 * online, so every intake type is counted once.
 */
async function seedServiceRequestVariety(db: Kysely<SimmerDatabase>): Promise<{
	readonly drainage: string;
	readonly noise: string;
	readonly insideDate: string;
}> {
	const inside = mapSurfaceRowIds.serviceRequest.inside;
	const drainage = '00000000-0000-4000-8000-000000009911';
	const noise = '00000000-0000-4000-8000-000000009912';
	const tagged = '00000000-0000-4000-8000-000000009913';
	const closed = '00000000-0000-4000-8000-000000009914';
	const untagged = '00000000-0000-4000-8000-000000009915';

	const copies = [
		{ id: tagged, daysBefore: 30, intake: 'phone', closedAt: null },
		{ id: closed, daysBefore: 60, intake: 'walk-in', closedAt: '2026-03-20T15:00:00.000Z' },
		{ id: untagged, daysBefore: 10, intake: 'other', closedAt: null },
	];
	for (const copy of copies) {
		await sql`
			insert into service_requests
				(id, organization_id, geom, request_date, intake_type, details, contact_id, address_id,
					closed_at)
			select ${copy.id}, organization_id, geom, request_date - ${copy.daysBefore}::int,
				${copy.intake}::request_intake_type, details, contact_id, address_id,
				${copy.closedAt}::timestamptz
			from service_requests
			where id = ${inside}
		`.execute(db);
	}

	await db
		.insertInto('tags')
		.values([
			{ id: drainage, organization_id: mapSurfaceOrganizationIds.own, tag_name: 'Drainage' },
			{ id: noise, organization_id: mapSurfaceOrganizationIds.own, tag_name: 'Noise' },
		])
		.execute();
	const tagItem = (tagId: string, entityId: string) => ({
		tag_id: tagId,
		organization_id: mapSurfaceOrganizationIds.own,
		entity_type: 'service_request',
		entity_id: entityId,
	});
	await db
		.insertInto('tag_items')
		.values([tagItem(drainage, tagged), tagItem(noise, tagged), tagItem(drainage, closed)])
		.execute();

	const date = await sql<{ readonly requestDate: string }>`
		select to_char(request_date, 'YYYY-MM-DD') as "requestDate"
		from service_requests where id = ${inside}
	`.execute(db);
	const insideDate = date.rows[0]?.requestDate;
	if (insideDate === undefined) {
		throw new Error('Expected the seeded service request back.');
	}
	return { drainage, noise, insideDate };
}

/** Today's calendar date in `timeZone`, as `YYYY-MM-DD`. */
function todayIn(timeZone: string): string {
	// en-CA for its year-month-day shape, which is how the dates are compared.
	return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** `date` moved by `days`, as `YYYY-MM-DD`. */
function addDays(date: string, days: number): string {
	const moved = new Date(`${date}T00:00:00.000Z`);
	moved.setUTCDate(moved.getUTCDate() + days);
	return moved.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
	return Math.round(
		(Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
	);
}

// Over 100 traps in view the Traps rail draws the same summary (#1372). The
// seeded world's one live trap in the box, an active one under the seeded
// method, is joined by four more that differ on method and status, and each
// count is checked against the page its button narrows to.
describeDbIntegration('trap summary against Postgres', () => {
	it('counts the traps the page counts, by collection method and status', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const { seededMethodId, lightMethodId } = await seedTrapVariety(db);

			const filterSets: readonly TrapMapFilters[] = [
				{},
				{ isActive: true },
				{ isActive: false },
				{ collectionMethodIds: [lightMethodId] },
				{ collectionMethodIds: [seededMethodId, lightMethodId] },
				{ isActive: false, collectionMethodIds: [lightMethodId] },
				{ search: 'no trap is named this' },
			];
			const answers = await Promise.all(
				filterSets.map((filters) => summaryAndPage(db, MAP_SURFACES.traps, filters)),
			);

			for (const { summary, pageTotal } of answers) {
				expect(summary.total).toBe(pageTotal);
				for (const groups of Object.values(summary.groups)) {
					expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(summary.total);
				}
			}

			expect(answers[0]?.summary).toEqual({
				total: 5,
				groups: {
					collectionMethodId: [
						{ value: lightMethodId, count: 3 },
						{ value: seededMethodId, count: 2 },
					],
					isActive: [
						{ value: true, count: 3 },
						{ value: false, count: 2 },
					],
				},
			});
			expect(answers[5]?.summary).toEqual({
				total: 1,
				groups: {
					collectionMethodId: [{ value: lightMethodId, count: 1 }],
					isActive: [{ value: false, count: 1 }],
				},
			});
			// A search matching nothing counts nothing, and every grouping is still a key.
			expect(answers[6]?.summary).toEqual({
				total: 0,
				groups: { collectionMethodId: [], isActive: [] },
			});
		});
	});
});

/**
 * Four more live traps beside the seeded `inside` one: an inactive one under
 * the seeded method, and three under a second method, one of them inactive.
 */
async function seedTrapVariety(
	db: Kysely<SimmerDatabase>,
): Promise<{ readonly seededMethodId: string; readonly lightMethodId: string }> {
	const inside = await db
		.selectFrom('traps')
		.select(['collection_method_id'])
		.where('id', '=', mapSurfaceRowIds.trap.inside)
		.executeTakeFirstOrThrow();
	const seededMethodId = String(inside.collection_method_id);
	const light = await db
		.insertInto('collection_methods')
		.values({ organization_id: mapSurfaceOrganizationIds.own, name: 'CDC light trap' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const lightMethodId = String(light.id);
	const base = {
		organization_id: mapSurfaceOrganizationIds.own,
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
	};
	await db
		.insertInto('traps')
		.values([
			{ ...base, collection_method_id: seededMethodId, is_active: false },
			{ ...base, collection_method_id: lightMethodId, is_active: true },
			{ ...base, collection_method_id: lightMethodId, is_active: true },
			{ ...base, collection_method_id: lightMethodId, is_active: false },
		])
		.execute();
	return { seededMethodId, lightMethodId };
}

// Over 100 collections in view the Collections rail draws the same summary
// (#1373). The seeded world's one live collection in the box, dated by a plain
// `collection_date`, is joined by the six status cases and the late one, so the
// box holds both timing modes. A collection's day is `collected_at` in the
// Organization's zone or `collection_date`, whichever its mode fills, and the
// summary reads the page's own predicate, so one day is asked for in two zones
// and the late collection moves out of it in the summary and the page at once.
describeDbIntegration('collection summary against Postgres', () => {
	it('counts the collections the page counts, by problem, awaiting and method', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			await seedStatusCollections(db);
			await seedLateCollection(db);
			const { seededMethodId, lightMethodId } = await moveCollectionsToSecondMethod(db);
			const read = (filters: CollectionMapFilters, timeZone = mapSurfaceTimeZone) =>
				summaryAndPage(db, MAP_SURFACES.collections, filters, timeZone);

			// Eight in the box: the seeded one, the six status cases and the late one.
			const all = await read({});
			expect(all.pageTotal).toBe(8);
			expect(all.summary).toEqual({
				total: 8,
				groups: {
					problem: [
						{ value: false, count: 6 },
						{ value: true, count: 2 },
					],
					awaiting: [
						{ value: true, count: 5 },
						{ value: false, count: 3 },
					],
					collectionMethodId: [
						{ value: seededMethodId, count: 6 },
						{ value: lightMethodId, count: 2 },
					],
				},
				figures: { zeroResult: 1, collected: 4 },
			});

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string | boolean, CollectionMapFilters])[] = [
				['problem', true, { problemOnly: true }],
				['awaiting', true, { awaitingOnly: true }],
				['collectionMethodId', seededMethodId, { collectionMethodIds: [seededMethodId] }],
				['collectionMethodId', lightMethodId, { collectionMethodIds: [lightMethodId] }],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			// One day, asked for in two zones. The late collection was emptied at
			// 02:30Z on the 16th, which is the 15th in New York and the 16th in
			// UTC, and the `collection_date` rows are the 15th in both. A trap still
			// out has no day at all, so the window drops both pending cases.
			const day = { dateFrom: '2026-03-15', dateTo: '2026-03-15' };
			const newYork = await read(day);
			const utc = await read(day, 'UTC');
			expect(newYork.pageTotal).toBe(6);
			expect(newYork.summary).toEqual({
				total: 6,
				groups: {
					problem: [
						{ value: false, count: 5 },
						{ value: true, count: 1 },
					],
					awaiting: [
						{ value: true, count: 5 },
						{ value: false, count: 1 },
					],
					collectionMethodId: [
						{ value: seededMethodId, count: 4 },
						{ value: lightMethodId, count: 2 },
					],
				},
				figures: { zeroResult: 1, collected: 4 },
			});
			expect(utc.pageTotal).toBe(5);
			expect(utc.summary).toEqual({
				total: 5,
				groups: {
					problem: [
						{ value: false, count: 4 },
						{ value: true, count: 1 },
					],
					awaiting: [
						{ value: true, count: 4 },
						{ value: false, count: 1 },
					],
					collectionMethodId: [
						{ value: seededMethodId, count: 4 },
						{ value: lightMethodId, count: 1 },
					],
				},
				figures: { zeroResult: 1, collected: 3 },
			});

			// Outside the window nothing is counted and nothing is added up.
			expect((await read({ dateFrom: '2026-03-17' })).summary).toEqual({
				total: 0,
				groups: { problem: [], awaiting: [], collectionMethodId: [] },
				figures: { zeroResult: 0, collected: 0 },
			});
		});
	});
});

/**
 * Moves the problem case and the late collection onto a second method, and
 * pins every `collection_date` to the 15th.
 */
async function moveCollectionsToSecondMethod(
	db: Kysely<SimmerDatabase>,
): Promise<{ readonly seededMethodId: string; readonly lightMethodId: string }> {
	const inside = await db
		.selectFrom('collections')
		.select(['collection_method_id'])
		.where('id', '=', mapSurfaceRowIds.collection.inside)
		.executeTakeFirstOrThrow();
	const seededMethodId = String(inside.collection_method_id);
	const light = await db
		.insertInto('collection_methods')
		.values({ organization_id: mapSurfaceOrganizationIds.own, name: 'CDC light trap' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const lightMethodId = String(light.id);
	await db
		.updateTable('collections')
		.set({ collection_method_id: lightMethodId })
		.where('id', 'in', [mapSurfaceStatusCollectionIds.problem, mapSurfaceLateCollectionId])
		.execute();
	// The seed writes `collection_date` from a `Date`, which the driver sends in
	// the machine's own zone, so west of UTC the column holds the 14th. Written
	// as text it is the 15th wherever the suite runs.
	await sql`
		update collections
		set collection_date = '2026-03-15'
		where collection_timing_mode = 'collection_date_duration'
	`.execute(db);
	return { seededMethodId, lightMethodId };
}

// Over 100 chemical applications in view the Chemical Applications rail draws
// the same summary (#1374). The seeded world's one live application in the box,
// 2 gallons of Larvicide A by backpack, is joined by five more across a second
// insecticide, a second method, a second applicator and a second unit, one of
// them dated in January. The amount applied is added up per insecticide and per
// unit and never across units, so one insecticide recorded in gallons and in
// ounces is two sums.
describeDbIntegration('chemical application summary against Postgres', () => {
	it('counts the applications the page counts, and sums the amount per insecticide and unit', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = await seedApplicationVariety(db);
			const read = (filters: ApplicationMapFilters) =>
				summaryAndPage(db, MAP_SURFACES.chemical, filters);

			const all = await read({});
			expect(all.pageTotal).toBe(6);
			expect(all.summary).toEqual({
				total: 6,
				groups: {
					insecticideId: [
						{ value: ids.larvicideId, count: 4 },
						{ value: ids.adulticideId, count: 2 },
					],
					applicationMethodId: [
						{ value: ids.truckMethodId, count: 3 },
						{ value: ids.backpackMethodId, count: 2 },
						{ value: null, count: 1 },
					],
					applicatorProfileId: [
						{ value: ids.secondApplicatorId, count: 3 },
						{ value: ids.seededApplicatorId, count: 2 },
						{ value: null, count: 1 },
					],
				},
				breakdowns: {
					amountApplied: [
						{ by: { insecticideId: ids.larvicideId, unitId: ids.gallonId }, count: 3, sum: 15 },
						{ by: { insecticideId: ids.adulticideId, unitId: ids.gallonId }, count: 2, sum: 2 },
						{ by: { insecticideId: ids.larvicideId, unitId: ids.ounceId }, count: 1, sum: 4 },
					],
				},
			});

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string, ApplicationMapFilters])[] = [
				['insecticideId', ids.larvicideId, { insecticideIds: [ids.larvicideId] }],
				['insecticideId', ids.adulticideId, { insecticideIds: [ids.adulticideId] }],
				['applicationMethodId', ids.truckMethodId, { applicationMethodIds: [ids.truckMethodId] }],
				[
					'applicationMethodId',
					ids.backpackMethodId,
					{ applicationMethodIds: [ids.backpackMethodId] },
				],
				[
					'applicatorProfileId',
					ids.secondApplicatorId,
					{ applicatorProfileIds: [ids.secondApplicatorId] },
				],
				[
					'applicatorProfileId',
					ids.seededApplicatorId,
					{ applicatorProfileIds: [ids.seededApplicatorId] },
				],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			// March alone drops the January application, and the sums follow the page.
			const march = await read({ dateFrom: '2026-03-01', dateTo: '2026-03-31' });
			expect(march.pageTotal).toBe(5);
			expect(march.summary.total).toBe(5);
			expect(march.summary.breakdowns).toEqual({
				amountApplied: [
					{ by: { insecticideId: ids.larvicideId, unitId: ids.gallonId }, count: 2, sum: 5 },
					{ by: { insecticideId: ids.adulticideId, unitId: ids.gallonId }, count: 2, sum: 2 },
					{ by: { insecticideId: ids.larvicideId, unitId: ids.ounceId }, count: 1, sum: 4 },
				],
			});

			// Outside the date window nothing is counted and nothing is added up.
			expect((await read({ dateFrom: '2026-04-01' })).summary).toEqual({
				total: 0,
				groups: { insecticideId: [], applicationMethodId: [], applicatorProfileId: [] },
				breakdowns: { amountApplied: [] },
			});
		});
	});
});

/**
 * Five more live applications in the box beside the seeded one: a second
 * insecticide, a truck method, a second applicator and a unit in ounces, with
 * one application carrying no method, one no applicator, and one dated in
 * January.
 */
async function seedApplicationVariety(db: Kysely<SimmerDatabase>): Promise<{
	readonly larvicideId: string;
	readonly adulticideId: string;
	readonly backpackMethodId: string;
	readonly truckMethodId: string;
	readonly seededApplicatorId: string;
	readonly secondApplicatorId: string;
	readonly gallonId: string;
	readonly ounceId: string;
}> {
	const inside = await db
		.selectFrom('applications')
		.select([
			'insecticide_id',
			'application_method_id',
			'applicator_profile_id',
			'application_unit_id',
		])
		.where('id', '=', mapSurfaceRowIds.application.inside)
		.executeTakeFirstOrThrow();
	const larvicideId = String(inside.insecticide_id);
	const backpackMethodId = String(inside.application_method_id);
	const seededApplicatorId = String(inside.applicator_profile_id);
	const gallonId = String(inside.application_unit_id);
	const organizationId = mapSurfaceOrganizationIds.own;

	const ounce = await db
		.insertInto('units')
		.values({
			code: 'map_surface_ounce',
			unit_name: 'Fluid ounce',
			abbreviation: 'fl oz',
			unit_type: 'volume',
			unit_system: 'us_customary',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const adulticide = await db
		.insertInto('insecticides')
		.values({
			organization_id: organizationId,
			trade_name: 'Adulticide B',
			active_ingredient: 'Permethrin',
			type: 'adulticide',
			registration_number: 'reg-map-surface-adulticide',
			default_unit_id: gallonId,
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const truck = await db
		.insertInto('application_methods')
		.values({ organization_id: organizationId, name: 'Truck ULV' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const second = await db
		.insertInto('profiles')
		.values({
			organization_id: organizationId,
			display_name: 'Second Applicator',
			email: 'second.applicator@example.test',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const ids = {
		larvicideId,
		adulticideId: String(adulticide.id),
		backpackMethodId,
		truckMethodId: String(truck.id),
		seededApplicatorId,
		secondApplicatorId: String(second.id),
		gallonId,
		ounceId: String(ounce.id),
	};

	// The date goes in as text, since a `Date` is sent in the machine's own zone.
	const base = {
		organization_id: organizationId,
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
		application_date: sql<Date>`date '2026-03-15'`,
	};
	await db
		.insertInto('applications')
		.values([
			{
				...base,
				insecticide_id: ids.larvicideId,
				application_method_id: ids.backpackMethodId,
				applicator_profile_id: ids.seededApplicatorId,
				amount_applied: 3,
				application_unit_id: ids.gallonId,
			},
			{
				...base,
				insecticide_id: ids.larvicideId,
				application_method_id: ids.truckMethodId,
				applicator_profile_id: null,
				amount_applied: 4,
				application_unit_id: ids.ounceId,
			},
			{
				...base,
				insecticide_id: ids.adulticideId,
				application_method_id: ids.truckMethodId,
				applicator_profile_id: ids.secondApplicatorId,
				amount_applied: 1.5,
				application_unit_id: ids.gallonId,
			},
			{
				...base,
				insecticide_id: ids.adulticideId,
				application_method_id: null,
				applicator_profile_id: ids.secondApplicatorId,
				amount_applied: 0.5,
				application_unit_id: ids.gallonId,
			},
			{
				...base,
				application_date: sql<Date>`date '2026-01-10'`,
				insecticide_id: ids.larvicideId,
				application_method_id: ids.truckMethodId,
				applicator_profile_id: ids.secondApplicatorId,
				amount_applied: 10,
				application_unit_id: ids.gallonId,
			},
		])
		.execute();
	return ids;
}

// Over 100 source reductions in view the Source Reductions rail draws the same
// summary (#1375). The seeded world's one live source reduction in the box, 4
// gallons eliminated, is joined by five more across a second method, a second
// technician and a second unit, one of them dated in January. Sources
// eliminated are added up per unit and never across units, so gallons and
// acres are two sums.
describeDbIntegration('source reduction summary against Postgres', () => {
	it('counts the source reductions the page counts, and sums sources eliminated per unit', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = await seedSourceReductionVariety(db);
			const read = (filters: SourceReductionMapFilters) =>
				summaryAndPage(db, MAP_SURFACES['source-reduction'], filters);

			const all = await read({});
			expect(all.pageTotal).toBe(6);
			expect(all.summary).toEqual({
				total: 6,
				groups: {
					sourceReductionMethodId: [
						{ value: ids.drainMethodId, count: 4 },
						{ value: ids.seededMethodId, count: 2 },
					],
					technicianProfileId: [
						{ value: ids.secondTechnicianId, count: 3 },
						{ value: ids.seededTechnicianId, count: 2 },
						{ value: null, count: 1 },
					],
				},
				breakdowns: {
					sourcesEliminated: [
						{ by: { unitId: ids.gallonId }, count: 3, sum: 20 },
						{ by: { unitId: ids.acreId }, count: 3, sum: 4.5 },
					],
				},
			});

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string, SourceReductionMapFilters])[] = [
				[
					'sourceReductionMethodId',
					ids.drainMethodId,
					{ sourceReductionMethodIds: [ids.drainMethodId] },
				],
				[
					'sourceReductionMethodId',
					ids.seededMethodId,
					{ sourceReductionMethodIds: [ids.seededMethodId] },
				],
				[
					'technicianProfileId',
					ids.secondTechnicianId,
					{ technicianProfileIds: [ids.secondTechnicianId] },
				],
				[
					'technicianProfileId',
					ids.seededTechnicianId,
					{ technicianProfileIds: [ids.seededTechnicianId] },
				],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			// March alone drops the January source reduction, and the sums follow
			// the page, so gallons fall behind acres on record count.
			const march = await read({ dateFrom: '2026-03-01', dateTo: '2026-03-31' });
			expect(march.pageTotal).toBe(5);
			expect(march.summary.total).toBe(5);
			expect(march.summary.breakdowns).toEqual({
				sourcesEliminated: [
					{ by: { unitId: ids.acreId }, count: 3, sum: 4.5 },
					{ by: { unitId: ids.gallonId }, count: 2, sum: 10 },
				],
			});

			// Outside the date window nothing is counted and nothing is added up.
			expect((await read({ dateFrom: '2026-04-01' })).summary).toEqual({
				total: 0,
				groups: { sourceReductionMethodId: [], technicianProfileId: [] },
				breakdowns: { sourcesEliminated: [] },
			});
		});
	});
});

/**
 * Five more live source reductions in the box beside the seeded one: a
 * drainage method, a second technician and a unit in acres, with one source
 * reduction carrying no technician and one dated in January.
 */
async function seedSourceReductionVariety(db: Kysely<SimmerDatabase>): Promise<{
	readonly seededMethodId: string;
	readonly drainMethodId: string;
	readonly seededTechnicianId: string;
	readonly secondTechnicianId: string;
	readonly gallonId: string;
	readonly acreId: string;
}> {
	const inside = await db
		.selectFrom('source_reductions')
		.select(['source_reduction_method_id', 'technician_profile_id', 'sources_eliminated_unit_id'])
		.where('id', '=', mapSurfaceRowIds.sourceReduction.inside)
		.executeTakeFirstOrThrow();
	const organizationId = mapSurfaceOrganizationIds.own;

	const acre = await db
		.insertInto('units')
		.values({
			code: 'map_surface_acre',
			unit_name: 'Acre',
			abbreviation: 'ac',
			unit_type: 'area',
			unit_system: 'us_customary',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const drain = await db
		.insertInto('source_reduction_methods')
		.values({ organization_id: organizationId, name: 'Drainage' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const second = await db
		.insertInto('profiles')
		.values({
			organization_id: organizationId,
			display_name: 'Second Technician',
			email: 'second.technician@example.test',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const ids = {
		seededMethodId: String(inside.source_reduction_method_id),
		drainMethodId: String(drain.id),
		seededTechnicianId: String(inside.technician_profile_id),
		secondTechnicianId: String(second.id),
		gallonId: String(inside.sources_eliminated_unit_id),
		acreId: String(acre.id),
	};

	// The date goes in as text, since a `Date` is sent in the machine's own zone.
	const base = {
		organization_id: organizationId,
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
		source_reduction_date: sql<Date>`date '2026-03-15'`,
	};
	await db
		.insertInto('source_reductions')
		.values([
			{
				...base,
				source_reduction_method_id: ids.seededMethodId,
				technician_profile_id: ids.seededTechnicianId,
				sources_eliminated_amount: 6,
				sources_eliminated_unit_id: ids.gallonId,
			},
			{
				...base,
				source_reduction_method_id: ids.drainMethodId,
				technician_profile_id: null,
				sources_eliminated_amount: 2.5,
				sources_eliminated_unit_id: ids.acreId,
			},
			{
				...base,
				source_reduction_method_id: ids.drainMethodId,
				technician_profile_id: ids.secondTechnicianId,
				sources_eliminated_amount: 1.5,
				sources_eliminated_unit_id: ids.acreId,
			},
			{
				...base,
				source_reduction_method_id: ids.drainMethodId,
				technician_profile_id: ids.secondTechnicianId,
				sources_eliminated_amount: 0.5,
				sources_eliminated_unit_id: ids.acreId,
			},
			{
				...base,
				source_reduction_date: sql<Date>`date '2026-01-10'`,
				source_reduction_method_id: ids.drainMethodId,
				technician_profile_id: ids.secondTechnicianId,
				sources_eliminated_amount: 10,
				sources_eliminated_unit_id: ids.gallonId,
			},
		])
		.execute();
	return ids;
}

// Over 100 biocontrol actions in view the Biocontrol Actions rail draws the
// same summary (#1376). The seeded world's one live biocontrol action in the
// box, 25 gallons released with no habitat, is joined by five more across a
// second method, a second technician, a unit counting fish and a linked
// habitat, one of them dated in January. The amount released is added up per
// unit and never across units, so gallons and fish are two sums.
describeDbIntegration('biocontrol summary against Postgres', () => {
	it('counts the biocontrol actions the page counts, and sums the amount released per unit', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = await seedBiocontrolVariety(db);
			const read = (filters: BiocontrolMapFilters) =>
				summaryAndPage(db, MAP_SURFACES.biocontrol, filters);

			const all = await read({});
			expect(all.pageTotal).toBe(6);
			expect(all.summary).toEqual({
				total: 6,
				groups: {
					biocontrolMethodId: [
						{ value: ids.fishMethodId, count: 4 },
						{ value: ids.seededMethodId, count: 2 },
					],
					technicianProfileId: [
						{ value: ids.secondTechnicianId, count: 3 },
						{ value: ids.seededTechnicianId, count: 2 },
						{ value: null, count: 1 },
					],
					habitat: [
						{ value: true, count: 4 },
						{ value: false, count: 2 },
					],
				},
				breakdowns: {
					amountReleased: [
						{ by: { unitId: ids.gallonId }, count: 4, sum: 110 },
						{ by: { unitId: ids.fishId }, count: 2, sum: 500 },
					],
				},
			});

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string | boolean, BiocontrolMapFilters])[] = [
				['biocontrolMethodId', ids.fishMethodId, { biocontrolMethodIds: [ids.fishMethodId] }],
				['biocontrolMethodId', ids.seededMethodId, { biocontrolMethodIds: [ids.seededMethodId] }],
				[
					'technicianProfileId',
					ids.secondTechnicianId,
					{ technicianProfileIds: [ids.secondTechnicianId] },
				],
				[
					'technicianProfileId',
					ids.seededTechnicianId,
					{ technicianProfileIds: [ids.seededTechnicianId] },
				],
				['habitat', true, { habitatLinkedOnly: true }],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			// March alone drops the January release, and the sums follow the page.
			const march = await read({ dateFrom: '2026-03-01', dateTo: '2026-03-31' });
			expect(march.pageTotal).toBe(5);
			expect(march.summary.total).toBe(5);
			expect(march.summary.breakdowns).toEqual({
				amountReleased: [
					{ by: { unitId: ids.gallonId }, count: 3, sum: 50 },
					{ by: { unitId: ids.fishId }, count: 2, sum: 500 },
				],
			});

			// Outside the date window nothing is counted and nothing is added up.
			expect((await read({ dateFrom: '2026-04-01' })).summary).toEqual({
				total: 0,
				groups: { biocontrolMethodId: [], technicianProfileId: [], habitat: [] },
				breakdowns: { amountReleased: [] },
			});
		});
	});
});

/**
 * Five more live biocontrol actions in the box beside the seeded one: a second
 * method, a second technician, a unit counting fish and four linked to the
 * seeded habitat, with one action carrying no technician and one dated in
 * January.
 */
async function seedBiocontrolVariety(db: Kysely<SimmerDatabase>): Promise<{
	readonly seededMethodId: string;
	readonly fishMethodId: string;
	readonly seededTechnicianId: string;
	readonly secondTechnicianId: string;
	readonly gallonId: string;
	readonly fishId: string;
}> {
	const inside = await db
		.selectFrom('biocontrol_actions')
		.select(['biocontrol_method_id', 'technician_profile_id', 'release_unit_id'])
		.where('id', '=', mapSurfaceRowIds.biocontrol.inside)
		.executeTakeFirstOrThrow();
	const organizationId = mapSurfaceOrganizationIds.own;

	const fish = await db
		.insertInto('units')
		.values({
			code: 'map_surface_fish',
			unit_name: 'Fish',
			abbreviation: 'fish',
			unit_type: 'count',
			unit_system: 'us_customary',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const fishMethod = await db
		.insertInto('biocontrol_methods')
		.values({ organization_id: organizationId, name: 'Gambusia release' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const second = await db
		.insertInto('profiles')
		.values({
			organization_id: organizationId,
			display_name: 'Second Technician',
			email: 'second.technician@example.test',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const ids = {
		seededMethodId: String(inside.biocontrol_method_id),
		fishMethodId: String(fishMethod.id),
		seededTechnicianId: String(inside.technician_profile_id),
		secondTechnicianId: String(second.id),
		gallonId: String(inside.release_unit_id),
		fishId: String(fish.id),
	};
	const habitatId = mapSurfaceRowIds.habitat.inside;

	// The date goes in as text, since a `Date` is sent in the machine's own zone.
	const base = {
		organization_id: organizationId,
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
		biocontrol_date: sql<Date>`date '2026-03-15'`,
	};
	await db
		.insertInto('biocontrol_actions')
		.values([
			{
				...base,
				biocontrol_method_id: ids.seededMethodId,
				technician_profile_id: ids.secondTechnicianId,
				amount_released: 15,
				release_unit_id: ids.gallonId,
				habitat_id: habitatId,
			},
			{
				...base,
				biocontrol_method_id: ids.fishMethodId,
				technician_profile_id: null,
				amount_released: 200,
				release_unit_id: ids.fishId,
				habitat_id: habitatId,
			},
			{
				...base,
				biocontrol_method_id: ids.fishMethodId,
				technician_profile_id: ids.secondTechnicianId,
				amount_released: 300,
				release_unit_id: ids.fishId,
				habitat_id: habitatId,
			},
			{
				...base,
				biocontrol_method_id: ids.fishMethodId,
				technician_profile_id: ids.seededTechnicianId,
				amount_released: 10,
				release_unit_id: ids.gallonId,
			},
			{
				...base,
				biocontrol_date: sql<Date>`date '2026-01-10'`,
				biocontrol_method_id: ids.fishMethodId,
				technician_profile_id: ids.secondTechnicianId,
				amount_released: 60,
				release_unit_id: ids.gallonId,
				habitat_id: habitatId,
			},
		])
		.execute();
	return ids;
}

// Over 100 outreach actions in view the Outreach Actions rail draws the same
// summary (#1377). The seeded world's one live outreach action in the box, 30
// people reached, is joined by five more across a second method, a second
// technician and one recorded with none, one of them dated in January. `reach`
// is `not null` and checked above zero, so every outreach action in view adds
// to Total reach and no null is ever skipped by the sum.
describeDbIntegration('outreach summary against Postgres', () => {
	it('counts the outreach actions the page counts, and sums the reach', async () => {
		await withTestDb(async ({ db }) => {
			await seedMapSurfaces(db);
			const ids = await seedOutreachVariety(db);
			const read = (filters: OutreachMapFilters) =>
				summaryAndPage(db, MAP_SURFACES.outreach, filters);

			const all = await read({});
			expect(all.pageTotal).toBe(6);
			expect(all.summary).toEqual({
				total: 6,
				groups: {
					outreachMethodId: [
						{ value: ids.secondMethodId, count: 4 },
						{ value: ids.seededMethodId, count: 2 },
					],
					technicianProfileId: [
						{ value: ids.secondTechnicianId, count: 3 },
						{ value: ids.seededTechnicianId, count: 2 },
						{ value: null, count: 1 },
					],
				},
				figures: { reachTotal: 255 },
			});

			// Each group's count is the total of the page its button narrows to.
			const narrowed: readonly (readonly [string, string, OutreachMapFilters])[] = [
				['outreachMethodId', ids.secondMethodId, { outreachMethodIds: [ids.secondMethodId] }],
				['outreachMethodId', ids.seededMethodId, { outreachMethodIds: [ids.seededMethodId] }],
				[
					'technicianProfileId',
					ids.secondTechnicianId,
					{ technicianProfileIds: [ids.secondTechnicianId] },
				],
				[
					'technicianProfileId',
					ids.seededTechnicianId,
					{ technicianProfileIds: [ids.seededTechnicianId] },
				],
			];
			const answers = await Promise.all(narrowed.map(([, , filters]) => read(filters)));
			narrowed.forEach(([grouping, value], index) => {
				const answer = answers[index];
				expect(answer?.summary.total).toBe(answer?.pageTotal);
				expect(all.summary.groups[grouping]?.find((group) => group.value === value)?.count).toBe(
					answer?.pageTotal,
				);
			});

			// The reach follows the filters: the second technician reached 12, 45 and 60.
			expect(
				(await read({ technicianProfileIds: [ids.secondTechnicianId] })).summary.figures,
			).toEqual({ reachTotal: 117 });

			// March alone drops the January outreach, and its 60 people with it.
			const march = await read({ dateFrom: '2026-03-01', dateTo: '2026-03-31' });
			expect(march.pageTotal).toBe(5);
			expect(march.summary.total).toBe(5);
			expect(march.summary.figures).toEqual({ reachTotal: 195 });

			// Outside the date window nothing is counted and the reach is zero.
			expect((await read({ dateFrom: '2026-04-01' })).summary).toEqual({
				total: 0,
				groups: { outreachMethodId: [], technicianProfileId: [] },
				figures: { reachTotal: 0 },
			});
		});
	});
});

/**
 * Five more live outreach actions in the box beside the seeded one: a second
 * method, a second technician, one recorded with no technician and one dated
 * in January.
 */
async function seedOutreachVariety(db: Kysely<SimmerDatabase>): Promise<{
	readonly seededMethodId: string;
	readonly secondMethodId: string;
	readonly seededTechnicianId: string;
	readonly secondTechnicianId: string;
}> {
	const inside = await db
		.selectFrom('outreach_actions')
		.select(['outreach_method_id', 'technician_profile_id'])
		.where('id', '=', mapSurfaceRowIds.outreach.inside)
		.executeTakeFirstOrThrow();
	const organizationId = mapSurfaceOrganizationIds.own;

	const secondMethod = await db
		.insertInto('outreach_methods')
		.values({ organization_id: organizationId, name: 'School talk' })
		.returning('id')
		.executeTakeFirstOrThrow();
	const second = await db
		.insertInto('profiles')
		.values({
			organization_id: organizationId,
			display_name: 'Second Technician',
			email: 'second.technician@example.test',
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	const ids = {
		seededMethodId: String(inside.outreach_method_id),
		secondMethodId: String(secondMethod.id),
		seededTechnicianId: String(inside.technician_profile_id),
		secondTechnicianId: String(second.id),
	};

	// The date goes in as text, since a `Date` is sent in the machine's own zone.
	const base = {
		organization_id: organizationId,
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
		outreach_date: sql<Date>`date '2026-03-15'`,
	};
	await db
		.insertInto('outreach_actions')
		.values([
			{
				...base,
				outreach_method_id: ids.seededMethodId,
				technician_profile_id: ids.secondTechnicianId,
				reach: 12,
			},
			{
				...base,
				outreach_method_id: ids.secondMethodId,
				technician_profile_id: null,
				reach: 100,
			},
			{
				...base,
				outreach_method_id: ids.secondMethodId,
				technician_profile_id: ids.secondTechnicianId,
				reach: 45,
			},
			{
				...base,
				outreach_method_id: ids.secondMethodId,
				technician_profile_id: ids.seededTechnicianId,
				reach: 8,
			},
			{
				...base,
				outreach_date: sql<Date>`date '2026-01-10'`,
				outreach_method_id: ids.secondMethodId,
				technician_profile_id: ids.secondTechnicianId,
				reach: 60,
			},
		])
		.execute();
	return ids;
}

// Over 100 addresses in view the Address Book rail draws a summary (#1378):
// the count, then locality and postal code as text, since neither has a
// filter behind it. A value counts as written less its surrounding
// whitespace, so ` Monroe Township ` and `Monroe Township` are one locality,
// and a null or blank one counts under a single null value rather than under
// an empty string. The seeded `inside` address carries no locality and no
// postal code, so it is the second null beside the blank one seeded here.
describeDbIntegration('address summary against Postgres', () => {
	it('counts the addresses the page counts, by trimmed locality and postal code', async () => {
		await withTestDb(async ({ db }) => {
			await seedAddressVariety(db);
			const read = (filters: AddressMvtTileFilters) =>
				summaryAndPage(db, MAP_SURFACES.addresses, filters);

			const all = await read({});
			expect(all.pageTotal).toBe(7);
			expect(all.summary).toEqual({
				total: 7,
				groups: {
					locality: [
						{ value: 'Monroe Township', count: 4 },
						{ value: null, count: 2 },
						{ value: 'Jamesburg', count: 1 },
					],
					postalCode: [
						{ value: '08831', count: 4 },
						{ value: null, count: 2 },
						{ value: '08850', count: 1 },
					],
				},
			});

			// The search narrows the summary the way it narrows the page.
			const jamesburg = await read({ search: 'jamesburg' });
			expect(jamesburg.pageTotal).toBe(1);
			expect(jamesburg.summary).toEqual({
				total: 1,
				groups: {
					locality: [{ value: 'Jamesburg', count: 1 }],
					postalCode: [{ value: '08850', count: 1 }],
				},
			});

			// The Region filter narrows them together too. Every address here sits
			// inside the seeded `inside` region and none inside the `outside` one.
			const ownRegion = await read({ regionIds: [mapSurfaceRowIds.region.inside] });
			expect(ownRegion.pageTotal).toBe(7);
			expect(ownRegion.summary).toEqual(all.summary);
			const farRegion = await read({ regionIds: [mapSurfaceRowIds.region.outside] });
			expect(farRegion.pageTotal).toBe(0);
			expect(farRegion.summary.total).toBe(0);

			// A search matching nothing counts nothing, and both groupings are still keys.
			const none = await read({ search: 'no address is named this' });
			expect(none.pageTotal).toBe(0);
			expect(none.summary).toEqual({ total: 0, groups: { locality: [], postalCode: [] } });
		});
	});
});

/**
 * Six more live addresses in the box beside the seeded `inside` one: four in
 * Monroe Township, one written with padding and one with a padded postal
 * code, one in Jamesburg, and one whose locality and postal code are blank.
 */
async function seedAddressVariety(db: Kysely<SimmerDatabase>): Promise<void> {
	await seedMapSurfaces(db);
	const base = {
		organization_id: mapSurfaceOrganizationIds.own,
		country: 'US',
		geom: sql<string>`st_setsrid(st_makepoint(${mapSurfacePlace.inside.lng}, ${mapSurfacePlace.inside.lat}), 4326)`,
	};
	await db
		.insertInto('addresses')
		.values([
			{ ...base, display_name: '1 Elm St', locality: ' Monroe Township ', postal_code: '08831' },
			{ ...base, display_name: '2 Elm St', locality: 'Monroe Township', postal_code: '08831' },
			{ ...base, display_name: '3 Elm St', locality: 'Monroe Township', postal_code: ' 08831 ' },
			{ ...base, display_name: '4 Elm St', locality: 'Monroe Township', postal_code: '08831' },
			{ ...base, display_name: '5 Oak St', locality: 'Jamesburg', postal_code: '08850' },
			{ ...base, display_name: '6 Oak St', locality: '   ', postal_code: '' },
		])
		.execute();
}
