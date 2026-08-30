import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import type { MergeableRecordType } from './record-merge.js';

/**
 * Records that might be the same record, found two ways.
 *
 * An address book accumulates the same place more than once: an import creates
 * rows rather than matching them, and a collector filing a record adds an
 * address the book already holds under a different spelling. Contacts do the
 * same, from two phone numbers.
 *
 * `readDuplicateCandidates` finds those, by shared value, and a cleanup page
 * lists what it proposes. Every proposal is cheap to explain in one line. Fuzzy
 * matching would catch more, but the threshold is a guess and it is worst
 * exactly here, where names come off a handful of templates and a similarity
 * score groups the whole agency.
 *
 * `readNearbyHabitats` is the other way, and habitats are the only record type
 * that uses it. A duplicate habitat is a place a crew found and named twice, so
 * two records for it agree about nothing except where they are, and the way to
 * find one is to stand at a habitat and look around rather than to scan a list.
 * That read starts from a habitat somebody already chose to keep.
 *
 * Nothing here decides anything. Both propose, and a person disposes, because a
 * merge has no undo and the evidence has to be legible enough to disagree with.
 */
export type DuplicateReason =
	| 'same_name'
	| 'same_street'
	| 'same_email'
	| 'same_phone'
	| 'same_coordinates';

/**
 * The record types a cleanup page lists.
 *
 * Fewer than `MergeableRecordType`, which is every type a merge can fold: a
 * habitat merges the same way and is not found the same way, so it is reached
 * from its own detail page rather than from a list of proposals.
 */
export type DuplicateRecordType = Exclude<MergeableRecordType, 'habitat'>;

const DUPLICATE_RECORD_TYPES: readonly DuplicateRecordType[] = ['address', 'contact'];

/**
 * Whether a path segment names a record type with a cleanup page.
 *
 * Its own check rather than `isMergeableRecordType`, because `habitat` is a
 * mergeable type with no list of proposals. Answering for it here would run a
 * lookup on a config that has no habitat entry.
 */
export function isDuplicateRecordType(value: string): value is DuplicateRecordType {
	return (DUPLICATE_RECORD_TYPES as readonly string[]).includes(value);
}

/** One candidate, with what the page needs to show it without a second read. */
export interface DuplicateRecord {
	readonly id: string;
	/** The record's own name. Empty when it has none, which habitats often do. */
	readonly label: string;
	/** The supporting line under the label: postal line, description, company. */
	readonly detail: string | null;
	readonly createdAt: Date;
	readonly lat: number | null;
	readonly lng: number | null;
	/**
	 * The editable columns this record fills in, keyed by column name.
	 *
	 * A merge retires the source rows, so a phone number only a source holds is
	 * gone from every surface once it runs. The page offers to carry those values
	 * onto the survivor, and it can only offer what it can see: reading the label
	 * alone would mean a second request per candidate to find out whether there
	 * was anything to carry.
	 *
	 * Blank is normalized to null here rather than on the page, because an empty
	 * string and a null both mean "this record does not say", and the whole
	 * carry-forward rule turns on which records say nothing.
	 */
	readonly fields: Readonly<Record<string, string | null>>;
}

export interface DuplicateGroup {
	/** Stable across a refetch, so a page can keep a group's selection open. */
	readonly key: string;
	readonly reason: DuplicateReason;
	/**
	 * The value the rows share, normalized as it was compared.
	 *
	 * Never null today: every reason is a shared value. It stays nullable because
	 * `DuplicateGroup` is what the wire carries, and a reason with no value is one
	 * config entry away.
	 */
	readonly value: string | null;
	/** Oldest first, which is the survivor a page preselects. */
	readonly records: readonly DuplicateRecord[];
}

/** How many groups one reason may propose before the page is more work than the duplicates. */
const DEFAULT_GROUP_LIMIT = 50;

interface DuplicateKey {
	readonly reason: DuplicateReason;
	/** Normalized so that case and padding do not hide a match. */
	readonly expression: RawBuilder<unknown>;
}

interface DuplicateConfig {
	readonly table: string;
	readonly label: RawBuilder<unknown>;
	readonly detail: RawBuilder<unknown>;
	readonly keys: readonly DuplicateKey[];
	/** Whether the table carries geometry, and so whether a record has coordinates to show. */
	readonly hasGeometry: boolean;
	/**
	 * The columns a merge can carry from a retired record onto the survivor.
	 *
	 * Every one of these has to be writable through an update command on the same
	 * table, because that is how the page carries it: one request naming the
	 * update and the merge together. A column with no command behind it would read
	 * back a value the page then offers and cannot send.
	 *
	 * Geometry is deliberately absent. It is not text, it is not comparable as a
	 * value, and moving it is a different decision from keeping a phone number.
	 */
	readonly fields: readonly string[];
}

/** `lower(btrim(x))`, mapped to null when it is left with nothing. */
function normalized(column: string): RawBuilder<unknown> {
	return sql`nullif(lower(btrim(${sql.ref(column)})), '')`;
}

/**
 * The coordinate pair as one key, so two records on the same point group.
 *
 * Exact rather than a radius. `lat` and `lng` are maintained from `geom` by a
 * trigger, so two rows geocoded from the same string in the same run hold the
 * same doubles, and `::text` renders a double as the shortest string that reads
 * back as itself. Two records that agree here agree exactly.
 *
 * Both halves have to be present. `concat_ws` skips a null argument, so a row
 * with a latitude and no longitude would key on the latitude alone and group
 * with anything sharing it.
 */
function coordinateKey(): RawBuilder<unknown> {
	return sql`case
		when ${sql.ref('lat')} is null or ${sql.ref('lng')} is null then null
		else ${sql.ref('lat')}::text || ', ' || ${sql.ref('lng')}::text
	end`;
}

/** The postal line, skipping the parts this address does not have. */
function joined(columns: readonly string[]): RawBuilder<unknown> {
	return sql`nullif(btrim(concat_ws(', ', ${sql.join(columns.map((column) => sql.ref(column)))})), '')`;
}

/**
 * The record's field values as one json column, rather than one column each.
 *
 * Aliasing them individually would put column names next to this query's own
 * aliases, and two of those aliases (`lat`, `lng`) are already real columns on
 * the located tables. One object keeps the field names in their own namespace,
 * so a config can name any column without colliding with the shape of the read.
 */
function fieldsObject(columns: readonly string[], alias?: string): RawBuilder<unknown> {
	return sql`jsonb_build_object(${sql.join(
		columns.flatMap((column) => [
			// The key is the bare column name whatever the query calls the table: it
			// is what the command endpoint reads, and a page sending `near.email`
			// would name a column no writer has.
			sql.lit(column),
			sql`nullif(btrim(${sql.ref(alias === undefined ? column : `${alias}.${column}`)}::text), '')`,
		]),
	)})`;
}

const DUPLICATE_CONFIGS: Record<DuplicateRecordType, DuplicateConfig> = {
	address: {
		table: 'addresses',
		label: sql.ref('display_name'),
		detail: joined(['address_line_1', 'locality', 'region', 'postal_code']),
		keys: [
			{ reason: 'same_name', expression: normalized('display_name') },
			{ reason: 'same_street', expression: normalized('address_line_1') },
			{ reason: 'same_coordinates', expression: coordinateKey() },
		],
		hasGeometry: true,
		fields: [
			'display_name',
			'address_line_1',
			'address_line_2',
			'locality',
			'region',
			'postal_code',
		],
	},

	/**
	 * Three keys rather than one, because a person is reached three ways and a
	 * second row for them usually repeats one of the three rather than the name.
	 * Two people at one household genuinely share a phone number, which is why
	 * this proposes rather than merges.
	 */
	contact: {
		table: 'contacts',
		label: sql`coalesce(${sql.ref('contact_name')}, '')`,
		detail: joined(['company', 'department', 'title']),
		keys: [
			{ reason: 'same_name', expression: normalized('contact_name') },
			{ reason: 'same_email', expression: normalized('email') },
			{
				reason: 'same_phone',
				expression: sql`nullif(regexp_replace(coalesce(${sql.ref(
					'preferred_phone',
				)}, ''), '[^0-9]', '', 'g'), '')`,
			},
		],
		hasGeometry: false,
		/*
		 * The three consent columns are deliberately not here. `wants_email` and its
		 * pair are a record of what a person agreed to, and false is an answer rather
		 * than a blank, so the carry-forward rule that fills an empty field from a
		 * retired row would be raising a consent flag nobody gave. The survivor keeps
		 * its own.
		 */
		fields: [
			'contact_name',
			'company',
			'department',
			'title',
			'email',
			'preferred_phone',
			'alternate_phone',
		],
	},
};

interface CandidateRow {
	readonly id: string;
	readonly label: string;
	readonly detail: string | null;
	readonly created_at: Date;
	readonly lat: number | null;
	readonly lng: number | null;
	/** `jsonb_build_object` over the config's field columns. */
	readonly fields: Record<string, string | null>;
}

interface KeyedRow extends CandidateRow {
	readonly dup_key: string;
}

export interface DuplicateCandidatesInput {
	readonly recordType: DuplicateRecordType;
	readonly organizationId: string;
	/** Groups per reason. Defaults to 50, which is a page's worth of review. */
	readonly limit?: number;
}

/**
 * Every duplicate set this agency's records suggest, with the reason for each.
 *
 * Every proposal is a shared value, which is evidence a person can check at a
 * glance. Habitats are not here: a duplicate habitat is a place a crew found and
 * named twice, so it is found by standing at one and looking around rather than
 * by scanning a list. `readNearbyHabitats` is that read, and the merge page
 * behind it starts from a habitat somebody already chose.
 */
export async function readDuplicateCandidates(
	db: DbExecutor,
	input: DuplicateCandidatesInput,
): Promise<readonly DuplicateGroup[]> {
	const config = DUPLICATE_CONFIGS[input.recordType];
	const limit = input.limit ?? DEFAULT_GROUP_LIMIT;

	const valueGroups = (
		await Promise.all(config.keys.map((key) => readValueGroups(db, config, key, input, limit)))
	).flat();

	return dropRepeats(valueGroups);
}

/**
 * One proposal per set of records, however many ways they match.
 *
 * Two rows for one address usually share their name *and* their coordinates, and
 * a contact who rang in twice usually repeats a name and a phone number. Each of
 * those is one merge, and listing it under every heading that found it makes the
 * second copy look like more work still to do.
 *
 * The first heading wins, which is declaration order: the evidence a person can
 * check at a glance leads, so a set matched by name and by coordinates is filed
 * under the name.
 *
 * Only an identical set is dropped. A group that merely sits inside a larger one
 * is a different, smaller merge, and the reader has no way to ask for it back.
 */
function dropRepeats(groups: readonly DuplicateGroup[]): readonly DuplicateGroup[] {
	const seen = new Set<string>();
	return groups.filter((group) => {
		const signature = group.records
			.map((record) => record.id)
			.sort()
			.join(',');
		if (seen.has(signature)) {
			return false;
		}
		seen.add(signature);
		return true;
	});
}

async function readValueGroups(
	db: DbExecutor,
	config: DuplicateConfig,
	key: DuplicateKey,
	input: DuplicateCandidatesInput,
	limit: number,
): Promise<readonly DuplicateGroup[]> {
	const result = await sql<KeyedRow>`
		with keyed as (
			select
				id,
				${key.expression} as dup_key,
				${config.label} as label,
				${config.detail} as detail,
				created_at,
				${coordinate(config, 'lat')} as lat,
				${coordinate(config, 'lng')} as lng,
				${fieldsObject(config.fields)} as fields
			from ${sql.table(config.table)}
			where organization_id = ${input.organizationId}
				and deleted_at is null
		),
		named as (
			select * from keyed where dup_key is not null
		),
		duplicated as (
			select dup_key
			from named
			group by dup_key
			having count(*) > 1
			order by dup_key
			limit ${limit}
		)
		select named.dup_key, named.id, named.label, named.detail, named.created_at,
			named.lat, named.lng, named.fields
		from named
		join duplicated on duplicated.dup_key = named.dup_key
		order by named.dup_key, named.created_at, named.id
	`.execute(db);

	const byKey = new Map<string, CandidateRow[]>();
	for (const row of result.rows) {
		const rows = byKey.get(row.dup_key);
		if (rows === undefined) {
			byKey.set(row.dup_key, [row]);
		} else {
			rows.push(row);
		}
	}

	return [...byKey].map(([value, rows]) => ({
		key: `${key.reason}:${value}`,
		reason: key.reason,
		value,
		records: rows.map(toRecord),
	}));
}

/** `lat`/`lng` where the table has them, and null where it does not. */
function coordinate(config: DuplicateConfig, column: 'lat' | 'lng'): RawBuilder<unknown> {
	return config.hasGeometry ? sql.ref(column) : sql`null::double precision`;
}

function toRecord(row: CandidateRow): DuplicateRecord {
	return {
		id: row.id,
		label: row.label,
		detail: row.detail,
		createdAt: row.created_at,
		lat: row.lat,
		lng: row.lng,
		fields: row.fields,
	};
}

// ===========================================================================
// Habitats, by proximity
// ===========================================================================

/** What the habitats table calls the columns a merge can carry. */
const HABITAT_FIELDS = ['habitat_name', 'description'] as const;

/** How many neighbours one search answers with, however wide the radius. */
const NEARBY_LIMIT = 100;

/** The widest search the endpoint will run, in metres. */
export const NEARBY_MAX_METRES = 5_000;

/** A habitat standing near another one, and how far away it is. */
export interface NearbyHabitat extends DuplicateRecord {
	/** Ground distance from the habitat being kept, in metres. */
	readonly distanceMetres: number;
	/**
	 * Whether it is still in service.
	 *
	 * A merge may retire an inactive habitat, so these are offered rather than
	 * filtered. Saying which is which is what stops a retired record looking like
	 * a live duplicate of the one being kept.
	 */
	readonly isActive: boolean;
}

export interface NearbyHabitatsInput {
	/** The habitat that would survive a merge. Never among the answers. */
	readonly habitatId: string;
	readonly organizationId: string;
	readonly radiusMetres: number;
}

export interface NearbyHabitatsResult {
	/** The habitat being kept, in the same shape as the candidates. */
	readonly target: DuplicateRecord;
	/** Nearest first, which is the order a reader checks them in. */
	readonly candidates: readonly NearbyHabitat[];
}

/**
 * The habitats standing near one habitat, for a merge that keeps that one.
 *
 * Two records for one catch basin agree about nothing except where they are.
 * The crew that filed the second one gave it their own handle and their own
 * description, so a shared-value search finds neither, and the only evidence
 * that they are one habitat is that they are in the same spot.
 *
 * The radius is the caller's, not a constant, because how far apart two records
 * for one place land depends on how they were filed: a GPS fix under tree cover
 * and a point dropped on an aerial can be tens of metres apart for the same
 * ditch, and an agency that maps culverts every hundred feet needs a tighter one
 * than that.
 *
 * The target comes back with the candidates so both are read the same way. The
 * merge form fills every field of the surviving record from these values, and a
 * page that built the target's half from a synced row instead would be a second
 * spelling of the same thing, free to drift.
 */
export async function readNearbyHabitats(
	db: DbExecutor,
	input: NearbyHabitatsInput,
): Promise<NearbyHabitatsResult | undefined> {
	const target = await readHabitatCandidate(db, input);
	if (target === undefined) {
		return undefined;
	}

	const result = await sql<
		CandidateRow & { readonly distance_metres: number; readonly is_active: boolean }
	>`
		select
			near.id,
			coalesce(near.habitat_name, '') as label,
			nullif(btrim(near.description), '') as detail,
			near.created_at,
			near.lat,
			near.lng,
			near.is_active,
			${fieldsObject([...HABITAT_FIELDS], 'near')} as fields,
			st_distance(near.geom::geography, home.geom::geography) as distance_metres
		from habitats as near
		join habitats as home
			on home.id = ${input.habitatId}
			and home.organization_id = near.organization_id
		where near.organization_id = ${input.organizationId}
			and near.deleted_at is null
			and near.id <> home.id
			-- Degrees first so the GiST index on geom can answer, metres after so
			-- the radius means the same distance at every latitude. The bound is
			-- generous on purpose: it may only ever include a pair the exact test
			-- then rejects.
			and st_dwithin(near.geom, home.geom, ${degreesFor(input.radiusMetres)})
			and st_dwithin(near.geom::geography, home.geom::geography, ${input.radiusMetres})
		order by distance_metres, near.id
		limit ${NEARBY_LIMIT}
	`.execute(db);

	return {
		target,
		candidates: result.rows.map((row) => ({
			...toRecord(row),
			distanceMetres: row.distance_metres,
			isActive: row.is_active,
		})),
	};
}

/** The habitat a merge would keep, or undefined when this agency has no such row. */
async function readHabitatCandidate(
	db: DbExecutor,
	input: NearbyHabitatsInput,
): Promise<DuplicateRecord | undefined> {
	const result = await sql<CandidateRow>`
		select
			id,
			coalesce(habitat_name, '') as label,
			nullif(btrim(description), '') as detail,
			created_at,
			lat,
			lng,
			${fieldsObject([...HABITAT_FIELDS])} as fields
		from habitats
		where id = ${input.habitatId}
			and organization_id = ${input.organizationId}
			and deleted_at is null
	`.execute(db);

	const row = result.rows[0];
	return row === undefined ? undefined : toRecord(row);
}

/**
 * A bounding-box radius in degrees wide enough never to exclude a true pair.
 *
 * The exact test is `st_dwithin` over geography, which is metres and correct
 * anywhere but cannot use the GiST index on `geom`. A degree of longitude
 * shrinks with latitude, so this carries four times the latitude figure, which
 * covers everything up to about 75 degrees north.
 */
function degreesFor(radiusMetres: number): number {
	return (radiusMetres / 111_320) * 4;
}
