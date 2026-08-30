import { type RawBuilder, sql } from 'kysely';
import type { DbExecutor } from '../index.js';

/**
 * One agency's records, another agency's records, and the rows that must never
 * come back.
 *
 * `map-surface-sql.test.ts` pins the SQL every map read emits, which proves the
 * tenancy and soft-delete predicates are *written*. It cannot prove they
 * **work** — a predicate against the wrong alias, or a join that resurrects a
 * deleted parent, compiles to text that passes every assertion there and still
 * hands one agency another's habitats. Nothing runs these reads.
 *
 * So this seeds each of the twelve map surfaces four times over, once per way a
 * read can be wrong:
 *
 * - `inside` — this agency's live record, inside {@link mapSurfacePlace.tile}
 *   and inside {@link mapSurfacePlace.bounds}. Every read must return it.
 * - `outside` — this agency's live record, far enough away to fall in neither.
 *   Only the unbounded reads (extent, page, by-id) may return it.
 * - `deleted` — this agency's soft-deleted record, in the same place as
 *   `inside`. No read may ever return it.
 * - `deletedFar` — this agency's soft-deleted record, far outside the span of
 *   every live row. No read may return it, and the extent reads are the only
 *   ones that can say so: an extent answers with a box rather than a row set, so
 *   a resurrected record inside the span would not move it.
 * - `otherOrg` — the other agency's live record, in the same place as `inside`.
 *   No read may ever return it.
 *
 * `deleted` and `otherOrg` sit on top of `inside` on purpose. A read that has
 * lost its scope does not fail quietly with them there — it answers with three
 * features where one was seeded, and the count is the assertion.
 */

/** The two agencies: the one doing the reading, and the one that must stay invisible. */
export const mapSurfaceOrganizationIds = {
	own: '00000000-0000-4000-8000-000000000301',
	other: '00000000-0000-4000-8000-000000000302',
} as const;

/**
 * Where the seeded records are, and the frames the spatial reads use.
 *
 * The tile is the z12 tile containing `inside`; `emptyTile` is a tile of open
 * ocean, which is the case #73 names — a tile with nothing in it must answer
 * with an empty buffer the client can cache, not a null and not an error.
 */
export const mapSurfacePlace = {
	inside: { lng: -90.5, lat: 35.5 },
	outside: { lng: -95.0, lat: 40.0 },
	far: { lng: -70.0, lat: 25.0 },
	tile: { z: 12, x: 1018, y: 1615 },
	emptyTile: { z: 12, x: 2048, y: 2048 },
	bounds: { west: -90.6, south: 35.4, east: -90.4, north: 35.6 },
} as const;

/**
 * The operational date every dated surface carries.
 *
 * One date for all of them, because no read under test filters by date — the
 * date is here to satisfy the not-null columns, not to be selected on.
 */
const operationalDate = '2026-03-15';

/** The five rows one surface is seeded with. */
export interface MapSurfaceRowIds {
	readonly inside: string;
	readonly outside: string;
	readonly deleted: string;
	readonly deletedFar: string;
	readonly otherOrg: string;
}

/** Every surface a map read answers for, whether or not it has an explorer. */
export type MapSurfaceName =
	| 'habitat'
	| 'inspection'
	| 'sample'
	| 'trap'
	| 'collection'
	| 'application'
	| 'sourceReduction'
	| 'biocontrol'
	| 'outreach'
	| 'requestedControlAction'
	| 'notificationRegistration'
	| 'address'
	| 'region';

const surfaceNames: readonly MapSurfaceName[] = [
	'habitat',
	'inspection',
	'sample',
	'trap',
	'collection',
	'application',
	'sourceReduction',
	'biocontrol',
	'outreach',
	'requestedControlAction',
	'notificationRegistration',
	'address',
	'region',
];

/**
 * The ids each surface's four rows carry.
 *
 * Derived rather than written out because forty-eight hand-typed UUIDs is
 * forty-eight chances to paste the same one twice, and a duplicate would show up
 * as a passing test rather than a failing insert.
 */
export const mapSurfaceRowIds = Object.fromEntries(
	surfaceNames.map((name, index) => [
		name,
		{
			inside: seedId(index, 1),
			outside: seedId(index, 2),
			deleted: seedId(index, 3),
			deletedFar: seedId(index, 4),
			otherOrg: seedId(index, 5),
		},
	]),
) as Record<MapSurfaceName, MapSurfaceRowIds>;

/**
 * A sample's geometry is its parent inspection's, so a sample can also be
 * orphaned by a delete it does not carry itself. This one is live, on this
 * agency, in the right place — and hangs off the deleted inspection.
 */
export const mapSurfaceSampleOnDeletedInspectionId = seedId(2, 6);

/**
 * A collection on the *other* timing mode — an exact `collected_at` instant
 * rather than a plain date — placed so the two zones disagree about its day.
 *
 * `2026-03-16T02:30Z` is 10:30pm on the 15th in New York. An agency there
 * filters it under the 15th; a reader converting in UTC files it under the 16th
 * and drops it from any window that ends on the 15th. Nothing else in this seed
 * can catch that, because every other collection here is dated by a plain
 * `collection_date` that no zone can move.
 */
export const mapSurfaceLateCollectionId = seedId(4, 6);
const mapSurfaceLateCollectionAt = new Date('2026-03-16T02:30:00.000Z');
/** The day {@link mapSurfaceLateCollectionAt} fell on, per zone. */
export const mapSurfaceLateCollectionDates = {
	'America/New_York': '2026-03-15',
	UTC: '2026-03-16',
} as const;

/**
 * The same typed calendar day, stamped the two ways the client has stamped it.
 *
 * A collection's date is keyed as a day and stored as an instant, and which
 * instant is the client's choice. Midday UTC — what it used to be — has twelve
 * hours of headroom, so it survives every zone strictly inside ±12 and no
 * further. An agency on `Pacific/Auckland` (UTC+12 in August) types the 4th and
 * the row is midnight on the 5th there.
 *
 * Both instants below are what `operationalDayAsInstant` in
 * `apps/web/src/lib/local-date.ts` produced for `2026-08-04`, before and after
 * issue #156 — the web suite asserts the client still produces the second one.
 * Here they are read back through the server's own conversion, which is the
 * half that has to agree with it.
 */
export const mapSurfaceStampedCollectionIds = {
	/** Midday in Auckland, which is midnight UTC that same morning. */
	agencyMidday: seedId(4, 7),
	/** Midday UTC, which is 01:00 on the 5th in Auckland. */
	utcMidday: seedId(4, 8),
} as const;

export const mapSurfaceStampedTypedDay = '2026-08-04';
const mapSurfaceStampedAt = {
	agencyMidday: new Date('2026-08-04T00:00:00.000Z'),
	utcMidday: new Date('2026-08-04T12:00:00.000Z'),
} as const;

/** The agency these are read back for. */
export const mapSurfaceStampedTimeZone = 'Pacific/Auckland';

/** The units the amount-bearing surfaces are measured in. Units are global. */
const unitId = '00000000-0000-4000-8000-000000000401';
const durationUnitId = '00000000-0000-4000-8000-000000000402';

export async function seedMapSurfaces(db: DbExecutor): Promise<void> {
	await db
		.insertInto('organizations')
		.values([
			{
				id: mapSurfaceOrganizationIds.own,
				workos_organization_id: 'org_map_surface_own',
				name: 'Map Surface District',
			},
			{
				id: mapSurfaceOrganizationIds.other,
				workos_organization_id: 'org_map_surface_other',
				name: 'Neighbouring District',
			},
		])
		.execute();

	await db
		.insertInto('units')
		.values([
			{
				id: unitId,
				code: 'map_surface_gallon',
				unit_name: 'Gallon',
				abbreviation: 'gal',
				unit_type: 'volume',
				unit_system: 'us_customary',
			},
			{
				id: durationUnitId,
				code: 'map_surface_hour',
				unit_name: 'Hour',
				abbreviation: 'hr',
				unit_type: 'duration',
				unit_system: 'si',
			},
		])
		.execute();

	for (const organizationId of Object.values(mapSurfaceOrganizationIds)) {
		await seedOrganizationLookups(db, organizationId);
	}

	await seedSurfaceRows(db);
}

// --- the lookups every surface row points at --------------------------------
//
// Each agency needs its own copy: an organization's records may only reference
// that organization's methods and people, and a seed that shared them would be
// testing a state the writers cannot produce.

/** The org-scoped rows a surface row's required foreign keys resolve to. */
interface OrganizationRefs {
	readonly profileId: string;
	readonly habitatTypeId: string;
	readonly collectionMethodId: string;
	readonly applicationMethodId: string;
	readonly sourceReductionMethodId: string;
	readonly biocontrolMethodId: string;
	readonly outreachMethodId: string;
	readonly insecticideId: string;
	readonly contactId: string;
}

/** Derived from the organization id so the two agencies' lookups cannot collide. */
function organizationRefs(organizationId: string): OrganizationRefs {
	const slot = organizationId === mapSurfaceOrganizationIds.own ? 1 : 2;
	return {
		profileId: seedId(90, slot),
		habitatTypeId: seedId(91, slot),
		collectionMethodId: seedId(92, slot),
		applicationMethodId: seedId(93, slot),
		sourceReductionMethodId: seedId(94, slot),
		biocontrolMethodId: seedId(95, slot),
		outreachMethodId: seedId(96, slot),
		insecticideId: seedId(97, slot),
		contactId: seedId(98, slot),
	};
}

async function seedOrganizationLookups(db: DbExecutor, organizationId: string): Promise<void> {
	const refs = organizationRefs(organizationId);

	await db
		.insertInto('profiles')
		.values({
			id: refs.profileId,
			organization_id: organizationId,
			display_name: 'Map Surface Technician',
			email: `tech.${refs.profileId}@example.test`,
		})
		.execute();

	// A registration always names a contact, so the notification surface needs one
	// per agency before its rows can exist.
	await db
		.insertInto('contacts')
		.values({
			id: refs.contactId,
			organization_id: organizationId,
			contact_name: 'Map Surface Resident',
		})
		.execute();

	await db
		.insertInto('habitat_types')
		.values({ id: refs.habitatTypeId, organization_id: organizationId, name: 'Roadside ditch' })
		.execute();

	await db
		.insertInto('collection_methods')
		.values({ id: refs.collectionMethodId, organization_id: organizationId, name: 'Gravid trap' })
		.execute();

	await db
		.insertInto('application_methods')
		.values({ id: refs.applicationMethodId, organization_id: organizationId, name: 'Backpack' })
		.execute();

	await db
		.insertInto('source_reduction_methods')
		.values({
			id: refs.sourceReductionMethodId,
			organization_id: organizationId,
			name: 'Container removal',
		})
		.execute();

	await db
		.insertInto('biocontrol_methods')
		.values({
			id: refs.biocontrolMethodId,
			organization_id: organizationId,
			name: 'Mosquitofish stocking',
		})
		.execute();

	await db
		.insertInto('outreach_methods')
		.values({ id: refs.outreachMethodId, organization_id: organizationId, name: 'Door hanger' })
		.execute();

	await db
		.insertInto('insecticides')
		.values({
			id: refs.insecticideId,
			organization_id: organizationId,
			trade_name: 'Larvicide A',
			active_ingredient: 'Bti',
			type: 'larvicide',
			registration_number: `reg-${refs.insecticideId}`,
			default_unit_id: unitId,
		})
		.execute();
}

// --- the four rows, once per surface -----------------------------------------

/** One seeded row's identity, place, and liveness — everything the surfaces share. */
interface SurfaceRow {
	readonly id: string;
	readonly organization_id: string;
	readonly geom: RawBuilder<string>;
	readonly deleted_at: Date | null;
	readonly refs: OrganizationRefs;
}

const deletedAt = new Date('2026-04-01T00:00:00.000Z');
const inspectionDate = new Date(`${operationalDate}T00:00:00.000Z`);

/** Which inspection each sample variant hangs off. */
const sampleParents: ReadonlyArray<readonly [keyof MapSurfaceRowIds, keyof MapSurfaceRowIds]> = [
	['inside', 'inside'],
	['outside', 'outside'],
	['deleted', 'inside'],
	['deletedFar', 'deletedFar'],
	['otherOrg', 'otherOrg'],
];

function surfaceRows(
	name: MapSurfaceName,
	geometry: (place: { lng: number; lat: number }) => RawBuilder<string> = point,
): SurfaceRow[] {
	const ids = mapSurfaceRowIds[name];
	const { own, other } = mapSurfaceOrganizationIds;

	return [
		{ id: ids.inside, organization_id: own, place: mapSurfacePlace.inside, deleted_at: null },
		{ id: ids.outside, organization_id: own, place: mapSurfacePlace.outside, deleted_at: null },
		{ id: ids.deleted, organization_id: own, place: mapSurfacePlace.inside, deleted_at: deletedAt },
		{ id: ids.deletedFar, organization_id: own, place: mapSurfacePlace.far, deleted_at: deletedAt },
		{ id: ids.otherOrg, organization_id: other, place: mapSurfacePlace.inside, deleted_at: null },
	].map(({ place, ...row }) => ({
		...row,
		geom: geometry(place),
		refs: organizationRefs(row.organization_id),
	}));
}

function point(place: { lng: number; lat: number }): RawBuilder<string> {
	return sql<string>`st_setsrid(st_makepoint(${place.lng}, ${place.lat}), 4326)`;
}

/** A small box around the place, for the surfaces whose records are areas. */
function box(place: { lng: number; lat: number }): RawBuilder<string> {
	return sql<string>`st_makeenvelope(
		${place.lng - 0.02},
		${place.lat - 0.02},
		${place.lng + 0.02},
		${place.lat + 0.02},
		4326
	)`;
}

async function seedSurfaceRows(db: DbExecutor): Promise<void> {
	await db
		.insertInto('addresses')
		.values(
			surfaceRows('address').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				display_name: '100 Main St',
				country: 'US',
			})),
		)
		.execute();

	await db
		.insertInto('regions')
		.values(
			surfaceRows('region', box).map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				name: 'North sector',
			})),
		)
		.execute();

	await db
		.insertInto('habitats')
		.values(
			surfaceRows('habitat').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				habitat_type_id: row.refs.habitatTypeId,
				habitat_name: 'Culvert 12',
				description: 'Standing water at the outfall.',
			})),
		)
		.execute();

	await db
		.insertInto('inspections')
		.values(
			surfaceRows('inspection').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				habitat_type_id: row.refs.habitatTypeId,
				inspected_by_profile_id: row.refs.profileId,
				inspection_date: inspectionDate,
				is_wet: true,
				dip_count: 10,
				density: 'light' as const,
			})),
		)
		.execute();

	// A sample's tenancy is its own and its geometry is its inspection's, so each
	// sample hangs off the inspection in the matching state — plus one live sample
	// on the deleted inspection, which only the join's own predicate excludes.
	// The soft-deleted sample sits on the *live* inspection, so what excludes it is
	// its own delete rather than its parent's.
	await db
		.insertInto('samples')
		.values([
			...sampleParents.map(([variant, inspectionVariant]) => ({
				id: mapSurfaceRowIds.sample[variant],
				organization_id:
					variant === 'otherOrg' ? mapSurfaceOrganizationIds.other : mapSurfaceOrganizationIds.own,
				deleted_at: variant.startsWith('deleted') ? deletedAt : null,
				inspection_id: mapSurfaceRowIds.inspection[inspectionVariant],
				display_name: 'Dip 1',
			})),
			{
				id: mapSurfaceSampleOnDeletedInspectionId,
				organization_id: mapSurfaceOrganizationIds.own,
				inspection_id: mapSurfaceRowIds.inspection.deleted,
				display_name: 'Dip on a deleted inspection',
			},
		])
		.execute();

	await db
		.insertInto('traps')
		.values(
			surfaceRows('trap').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				collection_method_id: row.refs.collectionMethodId,
				trap_name: 'Trap 7',
			})),
		)
		.execute();

	await db
		.insertInto('collections')
		.values(
			surfaceRows('collection').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				collection_method_id: row.refs.collectionMethodId,
				// `collections_timing_shape` admits one of two shapes and nothing in
				// between: this is the date + duration one, so the timestamp fields
				// must stay null and the duration fields must all be present.
				collection_timing_mode: 'collection_date_duration' as const,
				collection_date: inspectionDate,
				duration_amount: 12,
				duration_unit_id: durationUnitId,
			})),
		)
		.execute();

	await db
		.insertInto('applications')
		.values(
			surfaceRows('application').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				application_method_id: row.refs.applicationMethodId,
				insecticide_id: row.refs.insecticideId,
				applicator_profile_id: row.refs.profileId,
				application_date: inspectionDate,
				amount_applied: 2,
				application_unit_id: unitId,
			})),
		)
		.execute();

	await db
		.insertInto('source_reductions')
		.values(
			surfaceRows('sourceReduction').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				source_reduction_method_id: row.refs.sourceReductionMethodId,
				technician_profile_id: row.refs.profileId,
				source_reduction_date: inspectionDate,
				sources_eliminated_amount: 4,
				sources_eliminated_unit_id: unitId,
			})),
		)
		.execute();

	await db
		.insertInto('biocontrol_actions')
		.values(
			surfaceRows('biocontrol').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				biocontrol_method_id: row.refs.biocontrolMethodId,
				technician_profile_id: row.refs.profileId,
				biocontrol_date: inspectionDate,
				amount_released: 25,
				release_unit_id: unitId,
			})),
		)
		.execute();

	await db
		.insertInto('outreach_actions')
		.values(
			surfaceRows('outreach').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				outreach_method_id: row.refs.outreachMethodId,
				technician_profile_id: row.refs.profileId,
				outreach_date: inspectionDate,
				reach: 30,
			})),
		)
		.execute();

	await db
		.insertInto('requested_control_actions')
		.values(
			surfaceRows('requestedControlAction').map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				control_type: 'application' as const,
				requested_by_profile_id: row.refs.profileId,
			})),
		)
		.execute();

	// Areas rather than points: a registration covers ground, and its geometry is
	// what generation measures the buffer from, so a seed of bare points would
	// never exercise the shape the read exists to return.
	await db
		.insertInto('notification_registrations')
		.values(
			surfaceRows('notificationRegistration', box).map((row) => ({
				id: row.id,
				organization_id: row.organization_id,
				geom: row.geom,
				deleted_at: row.deleted_at,
				contact_id: row.refs.contactId,
			})),
		)
		.execute();
}

/**
 * A readable, collision-free UUID: the surface's slot and the row's slot, each
 * zero-padded into the last group.
 */
function seedId(surface: number, row: number): string {
	return `00000000-0000-4000-8000-${String(surface).padStart(6, '0')}${String(row).padStart(6, '0')}`;
}

/**
 * Adds the one collection whose calendar day depends on who is asking.
 *
 * Kept out of {@link seedMapSurfaces} on purpose: every surface there has
 * exactly the same five rows, and the shared assertions count on that. A sixth
 * collection would make the collections surface answer differently from its
 * eleven peers for a reason that has nothing to do with what those tests check.
 * Call it after the main seed, from the test that is actually about timezones.
 */
export async function seedLateCollection(db: DbExecutor): Promise<void> {
	await db
		.insertInto('collections')
		.values({
			id: mapSurfaceLateCollectionId,
			organization_id: mapSurfaceOrganizationIds.own,
			geom: point(mapSurfacePlace.inside),
			collection_method_id: seedId(92, 1),
			// `collections_timing_shape` admits one of two shapes: this is the exact
			// one, so `started_at` is required and every date+duration field must
			// stay null.
			collection_timing_mode: 'exact_timestamps',
			started_at: new Date('2026-03-14T14:00:00.000Z'),
			collected_at: mapSurfaceLateCollectionAt,
		})
		.execute();
}

/**
 * The two stamps of one typed day, so a reader can be asked which day each is.
 *
 * Separate from {@link seedMapSurfaces} for the same reason
 * {@link seedLateCollection} is: every other collection in that seed is dated by
 * a plain `collection_date`, which no zone can move, and adding rows that a zone
 * *can* move would change what the surface tests already assert.
 */
export async function seedStampedCollections(db: DbExecutor): Promise<void> {
	await db
		.insertInto('collections')
		.values(
			(['agencyMidday', 'utcMidday'] as const).map((stamp) => ({
				id: mapSurfaceStampedCollectionIds[stamp],
				organization_id: mapSurfaceOrganizationIds.own,
				geom: point(mapSurfacePlace.inside),
				collection_method_id: seedId(92, 1),
				collection_timing_mode: 'exact_timestamps' as const,
				started_at: mapSurfaceStampedAt[stamp],
				collected_at: mapSurfaceStampedAt[stamp],
			})),
		)
		.execute();
}

/**
 * One collection per branch of the status expression, keyed by the answer it
 * must produce.
 *
 * Two of these six carry the whole point. `pendingFlagged` is out and flagged,
 * and reads `pending` because a trap still out has nothing to report a problem
 * about yet — swap the first two branches of the `case` and it turns red on a
 * map where red means the crew already went back. `dateDurationDone` is
 * finished and has a null `collected_at`, because that is what date plus
 * duration stores; a status that took the null for "not emptied" without
 * checking the row's mode would paint every agency on that mode pending.
 *
 * The other four hold the ordering either side of those: `problem` beats
 * `zeroResult`, and an unflagged collection falls through to `collected`.
 */
export const mapSurfaceStatusCollections = {
	/** Exact timestamps, not emptied, nothing flagged. */
	pendingClean: 'pending',
	/** Exact timestamps, not emptied, flagged with a problem. */
	pendingFlagged: 'pending',
	/** Exact timestamps, emptied, flagged with a problem. */
	problem: 'problem',
	/** Date plus duration, so a finished collection has a null `collected_at`. */
	dateDurationDone: 'collected',
	/** Emptied, no problem, nothing in the trap. */
	zeroResult: 'zero_result',
	/** Emptied, nothing flagged. */
	collected: 'collected',
} as const;

type MapSurfaceStatusCase = keyof typeof mapSurfaceStatusCollections;

const statusCaseNames: readonly MapSurfaceStatusCase[] = [
	'pendingClean',
	'pendingFlagged',
	'problem',
	'dateDurationDone',
	'zeroResult',
	'collected',
];

/** The row each case is seeded as, derived so the six ids cannot collide. */
export const mapSurfaceStatusCollectionIds = Object.fromEntries(
	statusCaseNames.map((name, index) => [name, seedId(4, 10 + index)]),
) as Record<MapSurfaceStatusCase, string>;

const statusStartedAt = new Date('2026-03-14T14:00:00.000Z');
const statusCollectedAt = new Date('2026-03-15T14:00:00.000Z');

/** The flags one case sets on top of the columns every seeded collection shares. */
interface StatusFlags {
	readonly collected_at?: Date | null;
	readonly has_problem?: boolean;
	readonly is_zero_result?: boolean;
}

const statusTiming: Record<MapSurfaceStatusCase, StatusFlags> = {
	pendingClean: { collected_at: null },
	pendingFlagged: { collected_at: null, has_problem: true },
	problem: { collected_at: statusCollectedAt, has_problem: true },
	dateDurationDone: {},
	zeroResult: { collected_at: statusCollectedAt, is_zero_result: true },
	collected: { collected_at: statusCollectedAt },
};

/**
 * Seeds the six status rows, all at {@link mapSurfacePlace.inside} so one tile
 * carries them.
 *
 * Separate from {@link seedMapSurfaces} for the reason {@link seedLateCollection}
 * is: every surface there has the same five rows and the shared assertions count
 * on that.
 */
export async function seedStatusCollections(db: DbExecutor): Promise<void> {
	await db
		.insertInto('collections')
		.values(
			statusCaseNames.map((name) => ({
				id: mapSurfaceStatusCollectionIds[name],
				organization_id: mapSurfaceOrganizationIds.own,
				geom: point(mapSurfacePlace.inside),
				collection_method_id: seedId(92, 1),
				// `collections_timing_shape` admits one of two shapes and nothing
				// between them, so the mode decides which half of the timing columns
				// may be filled at all.
				...(name === 'dateDurationDone'
					? {
							collection_timing_mode: 'collection_date_duration' as const,
							collection_date: inspectionDate,
							duration_amount: 12,
							duration_unit_id: durationUnitId,
						}
					: { collection_timing_mode: 'exact_timestamps' as const, started_at: statusStartedAt }),
				...statusTiming[name],
			})),
		)
		.execute();
}
