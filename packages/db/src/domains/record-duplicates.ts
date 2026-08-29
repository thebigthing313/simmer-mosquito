import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import type { MergeableRecordType } from './record-merge.js';

/**
 * The rows a cleanup page proposes folding together.
 *
 * An address book accumulates the same place more than once: an import creates
 * rows rather than matching them, and a collector filing a record adds an
 * address the book already holds under a different spelling. The same happens to
 * habitats a crew names twice and to contacts who ring in from two numbers.
 *
 * Nothing here decides anything. It proposes sets and says what put each set
 * together, and a person picks the survivor. That division is the point: a
 * merge has no undo, so the evidence has to be legible enough to disagree with.
 * `readMergeImpact` in `record-merge.ts` is the other half, counting what a
 * chosen set would actually move.
 *
 * Every proposal is deliberately cheap to explain in one line. Fuzzy name
 * matching would catch more, but the threshold is a guess, and it is worst
 * exactly where this runs: habitat handles come off one template, so they are
 * all similar to each other and a similarity score groups the whole agency.
 */
export type DuplicateReason = 'same_name' | 'same_email' | 'same_phone' | 'same_place';

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
	 * The value the rows share, normalized as it was compared. Null for
	 * `same_place`, where what they share is a location rather than a string.
	 */
	readonly value: string | null;
	/** Oldest first, which is the survivor a page preselects. */
	readonly records: readonly DuplicateRecord[];
}

/** How close two records must be to read as one place. */
const PROXIMITY_METRES = 10;

/**
 * A generous bounding-box radius in degrees for the proximity prefilter.
 *
 * The exact test is `st_dwithin` over geography, which is metres and correct
 * anywhere. It cannot use the GiST index on `geom`, though, so a geometry
 * `st_dwithin` in degrees runs first to narrow the candidates, and it has to be
 * wide enough never to exclude a true pair. A degree of longitude shrinks with
 * latitude, so the constant carries four times the latitude figure, which covers
 * everything up to about 75 degrees north.
 */
const PROXIMITY_DEGREES = (PROXIMITY_METRES / 111_320) * 4;

/** How many groups one reason may propose before the page is more work than the duplicates. */
const DEFAULT_GROUP_LIMIT = 50;

/**
 * How many near pairs the proximity query will return.
 *
 * A self-join has no natural bound, and the case this whole module exists for is
 * the one that blows it up: an import that geocodes badly puts thousands of
 * addresses on one rooftop, and n rows at one point is n(n-1)/2 pairs. Ten
 * thousand of them is fifty million rows streamed into the process to build a
 * handful of proposals.
 *
 * The cap trims pairs rather than whole groups, so hitting it can leave a
 * cluster split across two proposals. That is the safe direction: each half is
 * still a real set of records within ten metres of each other, and merging one half
 * then refetching proposes the rest. The alternative, an unbounded read, takes
 * the page down instead.
 *
 * Ordered before the limit so the same pairs come back on every read, and a
 * group does not reshuffle while somebody is looking at it.
 */
const PROXIMITY_PAIR_LIMIT = 5_000;

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
	/** Whether the table carries geometry, and so whether a place group is possible. */
	readonly located: boolean;
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
function fieldsObject(columns: readonly string[]): RawBuilder<unknown> {
	return sql`jsonb_build_object(${sql.join(
		columns.flatMap((column) => [
			sql.lit(column),
			sql`nullif(btrim(${sql.ref(column)}::text), '')`,
		]),
	)})`;
}

const DUPLICATE_CONFIGS: Record<MergeableRecordType, DuplicateConfig> = {
	address: {
		table: 'addresses',
		label: sql.ref('display_name'),
		detail: joined(['address_line_1', 'locality', 'region', 'postal_code']),
		keys: [{ reason: 'same_name', expression: normalized('display_name') }],
		located: true,
		fields: [
			'display_name',
			'address_line_1',
			'address_line_2',
			'locality',
			'region',
			'postal_code',
		],
	},

	habitat: {
		table: 'habitats',
		label: sql`coalesce(${sql.ref('habitat_name')}, '')`,
		detail: sql`nullif(btrim(${sql.ref('description')}), '')`,
		keys: [{ reason: 'same_name', expression: normalized('habitat_name') }],
		located: true,
		fields: ['habitat_name', 'description'],
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
		located: false,
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
	readonly recordType: MergeableRecordType;
	readonly organizationId: string;
	/** Groups per reason. Defaults to 50, which is a page's worth of review. */
	readonly limit?: number;
}

/**
 * Every duplicate set this agency's records suggest, with the reason for each.
 *
 * Value groups come back first, because a shared name or number is evidence a
 * person can check at a glance. A place group whose records a value group
 * already names is dropped rather than listed twice: two rows called Depot on
 * the same corner are one proposal, and offering the same merge under two
 * headings makes the second look like more work to do.
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

	if (!config.located) {
		return valueGroups;
	}

	const seen = valueGroups.map((group) => new Set(group.records.map((record) => record.id)));
	const placeGroups = (await readPlaceGroups(db, config, input, limit)).filter(
		(group) => !seen.some((set) => coversAll(set, group)),
	);

	return [...valueGroups, ...placeGroups];
}

/** Whether a value group already proposes every record this place group names. */
function coversAll(seen: ReadonlySet<string>, group: DuplicateGroup): boolean {
	return group.records.every((record) => seen.has(record.id));
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

/**
 * The clusters of records sitting on top of each other.
 *
 * Postgres answers the pairs and this joins them up, rather than
 * `st_clusterdbscan` answering the clusters outright, because that function's
 * radius is in the units of the SRID. In 4326 those are degrees, and a degree of
 * longitude is 111 km at the equator and 55 km at 60 degrees north, so one
 * radius would mean a different distance for every agency. Pairs let the
 * distance stay in metres where a person can read it.
 *
 * Joining them is a transitive walk, not a fixed radius around one row: three
 * rows strung four metres apart are one place even though the ends are eight
 * apart, which is what a row of duplicates from repeated imports actually looks
 * like.
 */
async function readPlaceGroups(
	db: DbExecutor,
	config: DuplicateConfig,
	input: DuplicateCandidatesInput,
	limit: number,
): Promise<readonly DuplicateGroup[]> {
	const pairs = await sql<{ readonly left_id: string; readonly right_id: string }>`
		select near.id as left_id, far.id as right_id
		from ${sql.table(config.table)} as near
		join ${sql.table(config.table)} as far
			on far.organization_id = near.organization_id
			and far.deleted_at is null
			and far.id > near.id
			and st_dwithin(near.geom, far.geom, ${PROXIMITY_DEGREES})
			and st_dwithin(near.geom::geography, far.geom::geography, ${PROXIMITY_METRES})
		where near.organization_id = ${input.organizationId}
			and near.deleted_at is null
		order by near.id, far.id
		limit ${PROXIMITY_PAIR_LIMIT}
	`.execute(db);

	const components = connectedComponents(pairs.rows).slice(0, limit);
	if (components.length === 0) {
		return [];
	}

	const rows = await readRecordsById(
		db,
		config,
		input.organizationId,
		components.flatMap((component) => [...component]),
	);

	return components
		.map((component) => {
			const records = [...component]
				.map((id) => rows.get(id))
				.filter((row): row is CandidateRow => row !== undefined)
				.sort(byAge)
				.map(toRecord);
			return {
				key: `same_place:${records.map((record) => record.id).join('.')}`,
				reason: 'same_place' as const,
				value: null,
				records,
			};
		})
		.filter((group) => group.records.length > 1);
}

/** The rows a place group names, read once for every group at a time. */
async function readRecordsById(
	db: DbExecutor,
	config: DuplicateConfig,
	organizationId: string,
	recordIds: readonly string[],
): Promise<Map<string, CandidateRow>> {
	const result = await sql<CandidateRow>`
		select
			id,
			${config.label} as label,
			${config.detail} as detail,
			created_at,
			lat,
			lng,
			${fieldsObject(config.fields)} as fields
		from ${sql.table(config.table)}
		where organization_id = ${organizationId}
			and deleted_at is null
			and id = any(${[...recordIds]}::uuid[])
	`.execute(db);

	return new Map(result.rows.map((row) => [row.id, row]));
}

/**
 * Group the pairs into sets, one set per island of connected records.
 *
 * Union-find over at most a few hundred pairs. The sets come back keyed by the
 * lowest id they contain, so the same duplicates propose in the same order on
 * every read and a page's open group does not jump while the user reads it.
 */
function connectedComponents(
	pairs: readonly { readonly left_id: string; readonly right_id: string }[],
): readonly ReadonlySet<string>[] {
	const parent = new Map<string, string>();

	const find = (id: string): string => {
		let root = parent.get(id) ?? id;
		while (root !== (parent.get(root) ?? root)) {
			root = parent.get(root) ?? root;
		}
		parent.set(id, root);
		return root;
	};

	for (const pair of pairs) {
		const left = find(pair.left_id);
		const right = find(pair.right_id);
		if (left !== right) {
			parent.set(left < right ? right : left, left < right ? left : right);
		}
	}

	const components = new Map<string, Set<string>>();
	for (const id of new Set(pairs.flatMap((pair) => [pair.left_id, pair.right_id]))) {
		const root = find(id);
		const existing = components.get(root);
		if (existing === undefined) {
			components.set(root, new Set([id]));
		} else {
			existing.add(id);
		}
	}

	return [...components].sort(([left], [right]) => (left < right ? -1 : 1)).map(([, set]) => set);
}

/** `lat`/`lng` where the table has them, and null where it does not. */
function coordinate(config: DuplicateConfig, column: 'lat' | 'lng'): RawBuilder<unknown> {
	return config.located ? sql.ref(column) : sql`null::double precision`;
}

function byAge(left: CandidateRow, right: CandidateRow): number {
	const difference = left.created_at.getTime() - right.created_at.getTime();
	if (difference !== 0) {
		return difference;
	}
	return left.id < right.id ? -1 : 1;
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
