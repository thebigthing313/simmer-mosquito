/**
 * One Profile's field work, across every record type that attributes work to a
 * person, in one round-trip.
 *
 * Nine categories, collapsed into the four families the product's own domains
 * use. Attribution is **field attribution**: the record's own domain column
 * (`inspected_by_profile_id`, `applicator_profile_id`, …) or an
 * `additional_personnel` link. `created_by_profile_id` is deliberately not
 * activity for the six types that have a domain column — whoever typed a record
 * in the evening was not at its coordinates. Habitats and traps are the
 * exception: they carry no domain attribution column, so creation is the only
 * signal there is, and their pins mean "created this site record".
 */
/**
 * The vocabulary comes from the domain, which is the one declaration of it.
 *
 * This package restated all four lists until #432, on the stated grounds that it
 * depends on nothing but Kysely and cannot see `packages/domain`. That has not
 * been true since ADR 0013: `package.json` lists the domain as a dependency and
 * `tables.ts` imports from it. The restated copies were pinned equal by a test
 * in `apps/server`, which was the only place that could see both; that test goes
 * with them.
 */
import type {
	ActivityCategory,
	ActivityFamily,
	ActivityInvolvement,
	ActivityRole,
} from '@simmer-mosquito/domain';
import { type Kysely, type RawBuilder, sql } from 'kysely';
import type { SimmerDatabase } from '../index.js';
import {
	assertIanaTimeZone,
	habitatStatusSql,
	inspectionResultSql,
	localDateSql,
	trapLabelSql,
	trapStatusSql,
} from './record-display-sql.js';

export type { ActivityCategory, ActivityFamily, ActivityInvolvement, ActivityRole };

export interface ProfileActivityRow {
	readonly category: ActivityCategory;
	readonly family: ActivityFamily;
	readonly involvement: ActivityInvolvement;
	readonly role: ActivityRole;
	/** The record's id. Two entries can share one id — see the two-moment kinds. */
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	/** The day this entry happened (`YYYY-MM-DD`). */
	readonly date: string;
	/** The full moment, where the record genuinely carries one; null otherwise. */
	readonly occurredAt: string | null;
	/** The record's own name where it has one — a habitat, a trap, a request number. */
	readonly label: string | null;
	/**
	 * The place this record hangs off, already resolved to text: the habitat it
	 * was performed at, the trap it came out of, or the address it was logged
	 * against. Joined here rather than left to the client, because habitats and
	 * addresses are not eagerly synced and a list of "Inspection" with no site is
	 * the thing this surface exists to avoid.
	 */
	readonly siteName: string | null;
	/** The lookup that names the record's kind (type/method/insecticide). */
	readonly refId: string | null;
	/** A second lookup where one exists — an application's method, beside its product. */
	readonly methodRefId: string | null;
	/** The quantity the record measures: applied, eliminated, released, reached. */
	readonly amount: number | null;
	/** The unit `amount` is in. Null where the quantity is a bare count (outreach reach). */
	readonly unitId: string | null;
	/**
	 * One short, category-specific thing more: a density or `dry` for inspections,
	 * `problem`/`zero` for collections, `active`/`inactive`/`inaccessible` for
	 * sites, `open`/`closed` for requests, the reach description for outreach.
	 * The client already switches on category to lay a row out; this rides along.
	 */
	readonly detail: string | null;
}

export interface ProfileActivityInput {
	readonly organizationId: string;
	readonly profileId: string;
	/** Inclusive lower bound on the activity date (`YYYY-MM-DD`). */
	readonly dateFrom: string;
	/** Inclusive upper bound on the activity date (`YYYY-MM-DD`). */
	readonly dateTo: string;
	/**
	 * The agency's IANA timezone. Timestamps become calendar dates in it, so a
	 * trap set at 9pm files under the day the crew worked rather than the day
	 * the database server rolled over.
	 */
	readonly timeZone: string;
	/** Safety cap on total rows returned across all branches. */
	readonly limit?: number;
}

export const DEFAULT_PROFILE_ACTIVITY_LIMIT = 2000;

/**
 * The `entity_type` values `additional_personnel` is stored with, for the six
 * record types it can target.
 *
 * These are the **snake_case** spellings the column actually holds, while the
 * domain's target-type vocabulary is camelCase (`sourceReduction`,
 * `outreachAction`, …). A camelCase filter here matches nothing, and nothing
 * about the result says so — it looks exactly like "nobody assisted". This
 * package cannot import the domain package, so the list is spelled out here and
 * pinned against `ADDITIONAL_PERSONNEL_TARGET_TYPES.map(toDbEntityType)` by a
 * test in `apps/server`, which can see both.
 */
export const ACTIVITY_PERSONNEL_ENTITY_TYPES = [
	'inspection',
	'collection',
	'application',
	'source_reduction',
	'outreach_action',
	'biocontrol_action',
] as const;

/**
 * How one record type answers the four questions every entry needs: when it
 * happened, what to call it, what to resolve for a subtitle, and which family
 * it belongs to. Every branch aliases its record table `r`, so these are plain
 * expressions rather than functions of an alias.
 */
interface RecordShape {
	readonly category: ActivityCategory;
	readonly family: ActivityFamily;
	readonly table: string;
	/**
	 * The left joins this shape's site name needs. Every branch aliases its own
	 * table `r`, so `h`, `ad` and `t` are free for the habitat, address and trap
	 * a record hangs off.
	 */
	readonly joins?: string;
	/** The `date` this record's work is dated by. */
	readonly date: string;
	/** A `timestamptz` where one genuinely exists, `null` otherwise. */
	readonly occurredAt: string;
	readonly label: string;
	readonly siteName: string;
	readonly refId: string;
	readonly methodRefId?: string;
	readonly amount?: string;
	readonly unitId?: string;
	readonly detail?: string;
}

const NO_TIMESTAMP = 'null::timestamptz';
const NO_NUMBER = 'null::numeric';
const NO_TEXT = 'null::text';

/** The habitat, else the address, a record was performed at. */
const SITE_JOINS =
	'left join habitats h on h.id = r.habitat_id left join addresses ad on ad.id = r.address_id';
const SITE_NAME = `coalesce(nullif(btrim(h.habitat_name), ''), nullif(btrim(ad.display_name), ''))`;
const ADDRESS_JOIN = 'left join addresses ad on ad.id = r.address_id';
const ADDRESS_NAME = `nullif(btrim(ad.display_name), '')`;

/**
 * The nine record shapes, dated in one agency's timezone.
 *
 * Built per call rather than declared as constants because six of these date
 * expressions convert a `timestamptz`, and which calendar day that lands on is
 * the agency's question rather than the database server's.
 */
function recordShapes(timeZone: string): {
	readonly habitat: RecordShape;
	readonly inspection: RecordShape;
	readonly trap: RecordShape;
	readonly collection: RecordShape;
	readonly application: RecordShape;
	readonly sourceReduction: RecordShape;
	readonly biocontrol: RecordShape;
	readonly outreach: RecordShape;
	readonly serviceRequest: RecordShape;
} {
	const localDate = (expression: string) => localDateSql(expression, timeZone);

	return {
		habitat: {
			category: 'habitat',
			family: 'larval',
			table: 'habitats',
			date: localDate('r.created_at'),
			occurredAt: 'r.created_at',
			label: 'r.habitat_name',
			// A habitat *is* the site, so it names no other one.
			siteName: NO_TEXT,
			refId: 'r.habitat_type_id::text',
			detail: habitatStatusSql('r'),
		},
		inspection: {
			category: 'inspection',
			family: 'larval',
			table: 'inspections',
			joins: SITE_JOINS,
			date: 'r.inspection_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			siteName: SITE_NAME,
			refId: 'r.habitat_type_id::text',
			// What the explorer's badge reads: dry, or how much was found.
			detail: inspectionResultSql('r'),
		},
		trap: {
			category: 'trap',
			family: 'adult',
			table: 'traps',
			date: localDate('r.created_at'),
			occurredAt: 'r.created_at',
			label: trapLabelSql('r'),
			siteName: NO_TEXT,
			refId: 'r.collection_method_id::text',
			detail: trapStatusSql('r'),
		},
		collection: {
			category: 'collection',
			family: 'adult',
			table: 'collections',
			joins: 'left join traps t on t.id = r.trap_id',
			date: `coalesce(${localDate('r.collected_at')}, r.collection_date, ${localDate('r.started_at')})`,
			occurredAt: 'coalesce(r.collected_at, r.started_at)',
			label: NO_TEXT,
			// The trap it came out of. A collection with none was recorded ad hoc.
			siteName: trapLabelSql('t'),
			refId: 'r.collection_method_id::text',
			detail: `case when r.has_problem = true then 'problem'
				when r.is_zero_result = true then 'zero' else null end`,
		},
		application: {
			category: 'application',
			family: 'control',
			table: 'applications',
			joins: SITE_JOINS,
			date: 'r.application_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			siteName: SITE_NAME,
			refId: 'r.insecticide_id::text',
			methodRefId: 'r.application_method_id::text',
			amount: 'r.amount_applied',
			unitId: 'r.application_unit_id::text',
		},
		sourceReduction: {
			category: 'sourceReduction',
			family: 'control',
			table: 'source_reductions',
			joins: SITE_JOINS,
			date: 'r.source_reduction_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			siteName: SITE_NAME,
			refId: 'r.source_reduction_method_id::text',
			amount: 'r.sources_eliminated_amount',
			unitId: 'r.sources_eliminated_unit_id::text',
		},
		biocontrol: {
			category: 'biocontrol',
			family: 'control',
			table: 'biocontrol_actions',
			joins: SITE_JOINS,
			date: 'r.biocontrol_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			siteName: SITE_NAME,
			refId: 'r.biocontrol_method_id::text',
			amount: 'r.amount_released',
			unitId: 'r.release_unit_id::text',
		},
		outreach: {
			category: 'outreach',
			family: 'publicEngagement',
			table: 'outreach_actions',
			joins: ADDRESS_JOIN,
			date: 'r.outreach_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			siteName: ADDRESS_NAME,
			refId: 'r.outreach_method_id::text',
			// Reach is a count of people, not a measured quantity, so it carries no unit.
			amount: 'r.reach',
			detail: `nullif(btrim(r.reach_description), '')`,
		},
		serviceRequest: {
			category: 'serviceRequest',
			family: 'publicEngagement',
			table: 'service_requests',
			joins: ADDRESS_JOIN,
			date: 'r.request_date',
			occurredAt: NO_TIMESTAMP,
			label: `nullif(concat('Request ', r.display_name::text), 'Request ')`,
			siteName: ADDRESS_NAME,
			// Requests carry no method or type lookup; the intake type is a column.
			refId: NO_TEXT,
			detail: `case when r.closed_at is null then 'open' else 'closed' end`,
		},
	};
}

type RecordShapes = ReturnType<typeof recordShapes>;

/** One branch of the union: a record shape, plus who it counts for and why. */
interface PrimaryBranch {
	readonly shape: RecordShape;
	readonly role: ActivityRole;
	/** The column naming the Profile whose field work this entry is. */
	readonly profileColumn: string;
	/** Where the entry's own moment differs from the record's default one. */
	readonly date?: string;
	readonly occurredAt?: string;
	/** An extra predicate — the two-moment kinds use it to omit a visit that has not happened. */
	readonly where?: string;
}

/**
 * The eleven primary branches: nine categories, with collections and service
 * requests each contributing two.
 *
 * Both of those record two separate moments in one row, potentially days apart
 * and potentially by different people. Collapsing either would lose a visit —
 * the traps a person set on Monday and collected on Thursday belong on both
 * days, and a request received by one person and closed by another is two
 * people's work.
 */
function primaryBranches(shapes: RecordShapes, timeZone: string): readonly PrimaryBranch[] {
	const localDate = (expression: string) => localDateSql(expression, timeZone);

	return [
		{ shape: shapes.habitat, role: 'created', profileColumn: 'created_by_profile_id' },
		{ shape: shapes.inspection, role: 'inspected', profileColumn: 'inspected_by_profile_id' },
		{ shape: shapes.trap, role: 'created', profileColumn: 'created_by_profile_id' },
		{
			shape: shapes.collection,
			role: 'set',
			profileColumn: 'set_by_profile_id',
			// A collection is dated by whichever of the two mutually-exclusive timing
			// shapes it was recorded in — `collections_timing_shape` guarantees exactly
			// one is populated, so reading either column alone silently empties adult
			// surveillance for every agency on the other mode.
			date: `coalesce(${localDate('r.started_at')}, r.collection_date)`,
			occurredAt: 'r.started_at',
		},
		{
			shape: shapes.collection,
			role: 'collected',
			profileColumn: 'collected_by_profile_id',
			date: `coalesce(${localDate('r.collected_at')}, r.collection_date)`,
			occurredAt: 'r.collected_at',
			// A trap set but not yet collected has no collect visit to report. In the
			// date + duration shape the collection date *is* the collection, so it is
			// the timestamp alone that can be absent.
			where: '(r.collected_at is not null or r.collection_date is not null)',
		},
		{ shape: shapes.application, role: 'applied', profileColumn: 'applicator_profile_id' },
		{ shape: shapes.sourceReduction, role: 'reduced', profileColumn: 'technician_profile_id' },
		{ shape: shapes.biocontrol, role: 'released', profileColumn: 'technician_profile_id' },
		{ shape: shapes.outreach, role: 'engaged', profileColumn: 'technician_profile_id' },
		{ shape: shapes.serviceRequest, role: 'received', profileColumn: 'received_by_profile_id' },
		{
			shape: shapes.serviceRequest,
			role: 'closed',
			profileColumn: 'closed_by_profile_id',
			date: localDate('r.closed_at'),
			occurredAt: 'r.closed_at',
			where: 'r.closed_at is not null',
		},
	];
}

/** The record shape each `additional_personnel.entity_type` value points at. */
function shapeByEntityType(
	shapes: RecordShapes,
): Readonly<Record<(typeof ACTIVITY_PERSONNEL_ENTITY_TYPES)[number], RecordShape>> {
	return {
		inspection: shapes.inspection,
		collection: shapes.collection,
		application: shapes.application,
		source_reduction: shapes.sourceReduction,
		outreach_action: shapes.outreach,
		biocontrol_action: shapes.biocontrol,
	};
}

/**
 * Every record the Profile is named on or assisted with, in `[dateFrom,
 * dateTo]`, across the nine categories — one `union all`, one round-trip.
 *
 * Each branch scopes to the agency first so the `(organization_id, <date> desc,
 * …)` indexes stay usable, and excludes soft-deleted rows — on the record and,
 * for the assisting branches, on the personnel link too. Ordered newest-first
 * and capped; the caller reports truncation rather than trimming quietly.
 */
export async function listProfileActivity(
	db: Kysely<SimmerDatabase>,
	input: ProfileActivityInput,
): Promise<ProfileActivityRow[]> {
	const limit = input.limit ?? DEFAULT_PROFILE_ACTIVITY_LIMIT;

	const result = await sql<ProfileActivityRow>`
		${sql.join(activityBranches(input), sql` union all `)}
		order by "date" desc, "occurredAt" desc nulls last
		limit ${limit}
	`.execute(db);

	return result.rows.map((row) => ({
		...row,
		lat: Number(row.lat),
		lng: Number(row.lng),
		// `numeric` arrives as a string over the wire, and a quantity rendered as
		// one formats wrong rather than failing.
		amount: row.amount === null ? null : Number(row.amount),
	}));
}

/**
 * How many entries the same question has, ignoring the row cap.
 *
 * Only worth asking when the cap actually bit: this re-runs all seventeen
 * branches, so the caller pays for it exactly when it has something to say —
 * "showing the first 2000 of 4,317" rather than a truncation flag with no
 * magnitude, which tells an operator their log is short but not by how much.
 */
export async function countProfileActivity(
	db: Kysely<SimmerDatabase>,
	input: ProfileActivityInput,
): Promise<number> {
	const result = await sql<{ readonly total: string }>`
		select count(*)::text as total
		from (${sql.join(activityBranches(input), sql` union all `)}) as entries
	`.execute(db);

	return Number(result.rows[0]?.total ?? 0);
}

/**
 * The seventeen branches one question expands to: eleven where the Profile is
 * named on the record, six where they assisted on it.
 */
function activityBranches(input: ProfileActivityInput): RawBuilder<ProfileActivityRow>[] {
	const timeZone = assertIanaTimeZone(input.timeZone);
	const shapes = recordShapes(timeZone);
	const assistingShapes = shapeByEntityType(shapes);
	const scope: BranchScope = {
		org: input.organizationId,
		profileId: input.profileId,
		dateFrom: input.dateFrom,
		dateTo: input.dateTo,
	};

	return [
		...primaryBranches(shapes, timeZone).map((branch) => primarySelect(branch, scope)),
		...ACTIVITY_PERSONNEL_ENTITY_TYPES.map((entityType) =>
			assistingSelect(assistingShapes[entityType], entityType, scope),
		),
	];
}

interface BranchScope {
	readonly org: string;
	readonly profileId: string;
	readonly dateFrom: string;
	readonly dateTo: string;
}

function primarySelect(branch: PrimaryBranch, scope: BranchScope): RawBuilder<ProfileActivityRow> {
	const { shape } = branch;
	const date = branch.date ?? shape.date;

	return sql<ProfileActivityRow>`
		select ${projection(shape, {
			involvement: 'primary',
			role: branch.role,
			date,
			occurredAt: branch.occurredAt ?? shape.occurredAt,
		})}
		from ${sql.raw(shape.table)} r
		${shape.joins === undefined ? sql`` : sql.raw(shape.joins)}
		where r.organization_id = ${scope.org}
			and r.deleted_at is null
			and r.${sql.raw(branch.profileColumn)} = ${scope.profileId}
			and (${sql.raw(date)}) between ${scope.dateFrom}::date and ${scope.dateTo}::date
			${branch.where === undefined ? sql`` : sql`and ${sql.raw(branch.where)}`}
	`;
}

/**
 * One assisting branch, per record type `additional_personnel` can target.
 *
 * The link carries its own soft delete: a crew member removed from a record
 * must leave that record's log, and the record itself is still live.
 */
function assistingSelect(
	shape: RecordShape,
	entityType: (typeof ACTIVITY_PERSONNEL_ENTITY_TYPES)[number],
	scope: BranchScope,
): RawBuilder<ProfileActivityRow> {
	return sql<ProfileActivityRow>`
		select ${projection(shape, {
			involvement: 'assisting',
			role: 'assisted',
			date: shape.date,
			occurredAt: shape.occurredAt,
		})}
		from additional_personnel ap
		join ${sql.raw(shape.table)} r on r.id = ap.entity_id
		${shape.joins === undefined ? sql`` : sql.raw(shape.joins)}
		where ap.organization_id = ${scope.org}
			and ap.deleted_at is null
			and ap.personnel_profile_id = ${scope.profileId}
			and ap.entity_type = ${entityType}
			and r.organization_id = ${scope.org}
			and r.deleted_at is null
			and (${sql.raw(shape.date)}) between ${scope.dateFrom}::date and ${scope.dateTo}::date
	`;
}

/**
 * The one row shape every branch normalises to.
 *
 * Every literal is cast: a `union all` takes its column types from the first
 * branch, and an uncast literal arrives as `unknown`, which makes the branch
 * order load-bearing for no reason.
 */
function projection(
	shape: RecordShape,
	entry: {
		readonly involvement: ActivityInvolvement;
		readonly role: ActivityRole;
		readonly date: string;
		readonly occurredAt: string;
	},
): RawBuilder<unknown> {
	return sql`
		${shape.category}::text as category,
		${shape.family}::text as family,
		${entry.involvement}::text as involvement,
		${entry.role}::text as role,
		r.id::text as id,
		r.lat,
		r.lng,
		to_char(${sql.raw(entry.date)}, 'YYYY-MM-DD') as date,
		to_char(
			(${sql.raw(entry.occurredAt)}) at time zone 'UTC',
			'YYYY-MM-DD"T"HH24:MI:SS"Z"'
		) as "occurredAt",
		${sql.raw(shape.label)} as label,
		${sql.raw(shape.siteName)} as "siteName",
		${sql.raw(shape.refId)} as "refId",
		${sql.raw(shape.methodRefId ?? NO_TEXT)} as "methodRefId",
		${sql.raw(shape.amount ?? NO_NUMBER)} as amount,
		${sql.raw(shape.unitId ?? NO_TEXT)} as "unitId",
		${sql.raw(shape.detail ?? NO_TEXT)} as detail
	`;
}
