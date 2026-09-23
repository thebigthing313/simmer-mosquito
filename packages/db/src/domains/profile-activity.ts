/**
 * The nine record shapes an activity entry is read off: which table, which
 * family, how it is dated, what it is titled and badged by.
 *
 * The activity read itself is gone from the server. The Activity Monitor and
 * the Dashboard's people table read one day of the synced tables through
 * `useDayActivity` in `apps/web`, and `components/activity/activity-entries`
 * there is the one copy of the seventeen branches. What stays here is the
 * register the service request nearby view still reads its select from.
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
import type { ActivityCategory, ActivityFamily } from '@simmer-mosquito/domain';
import { type RawBuilder, sql } from 'kysely';
import {
	collectionStatusSql,
	habitatStatusSql,
	inspectionResultSql,
	lifeStageCodesSql,
	localDateSql,
	recordTagIdsSql,
	trapLabelSql,
	trapStatusSql,
} from './record-display-sql.js';

export type { ActivityCategory, ActivityFamily };

/**
 * The half of an activity row that describes the record rather than the
 * person: which record it is, where it is, when its work is dated, and what a
 * list row is titled and badged by. Every column here is read off the
 * {@link RecordShape} register, so a second reader over the same nine tables
 * answers with the same columns without writing them again; the service
 * request nearby view is that reader, and adds a distance.
 */
export interface ActivityRecordRow {
	readonly category: ActivityCategory;
	readonly family: ActivityFamily;
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
	readonly placeName: string | null;
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
	 * the four-state status for collections, `active`/`inactive`/`inaccessible`
	 * for sites, `open`/`closed` for requests, the reach description for
	 * outreach. The client already switches on category to lay a row out; this
	 * rides along.
	 */
	readonly detail: string | null;
	/**
	 * The life stages an inspection found, as the `E1234P` codes the strip draws.
	 * Null on every other category, and on an inspection that found none.
	 */
	readonly stages: string | null;
	/**
	 * What a control action was performed against: `larval` where it names a
	 * habitat or an inspection, `standalone` where it names neither. Null on
	 * every category that has no such link.
	 */
	readonly context: string | null;
	/** Whether a collection caught something other than what it was set for. */
	readonly hasBycatch: boolean | null;
	/**
	 * The Tags on this record, as ids the client resolves against the eagerly
	 * synced catalog. Null on the categories that carry no Tags.
	 */
	readonly tagIds: readonly string[] | null;
}

/**
 * How one record type answers the four questions every entry needs: when it
 * happened, what to call it, what to resolve for a subtitle, and which family
 * it belongs to. Every branch aliases its record table `r`, so these are plain
 * expressions rather than functions of an alias.
 *
 * This is the register a second reader over these tables reads its select
 * from. The service request nearby view used to carry a thinner copy of it,
 * one label, one ref and one status per category, and the two had drifted by
 * the time the activity row grew a place name and a life-stage strip (#1086).
 */
export interface RecordShape {
	readonly category: ActivityCategory;
	readonly family: ActivityFamily;
	readonly table: string;
	/**
	 * The record is a place rather than work done at one. It carries no
	 * operational date, so `date` below is the day its record was created, and a
	 * reader asking "what happened in this window" leaves such a record out of
	 * the window rather than dating it by when somebody typed it in.
	 */
	readonly place?: true;
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
	readonly placeName: string;
	readonly refId: string;
	readonly methodRefId?: string;
	readonly amount?: string;
	readonly unitId?: string;
	readonly detail?: string;
	readonly stages?: string;
	readonly context?: string;
	readonly hasBycatch?: string;
	readonly tagIds?: string;
}

const NO_TIMESTAMP = 'null::timestamptz';
const NO_NUMBER = 'null::numeric';
const NO_TEXT = 'null::text';
const NO_FLAG = 'null::boolean';
const NO_TEXT_ARRAY = 'null::text[]';

/** The habitat, else the address, a record was performed at. */
const SITE_JOINS =
	'left join habitats h on h.id = r.habitat_id left join addresses ad on ad.id = r.address_id';
const PLACE_NAME = `coalesce(nullif(btrim(h.habitat_name), ''), nullif(btrim(ad.display_name), ''))`;
const ADDRESS_JOIN = 'left join addresses ad on ad.id = r.address_id';
const ADDRESS_NAME = `nullif(btrim(ad.display_name), '')`;

/**
 * The nine record shapes, dated in one organization's timezone.
 *
 * Built per call rather than declared as constants because six of these date
 * expressions convert a `timestamptz`, and which calendar day that lands on is
 * the organization's question rather than the database server's. The zone is
 * taken as given: `activityBranches` has already run it through
 * `assertIanaTimeZone`, and a second reader owes the same call.
 */
export function recordShapes(timeZone: string): {
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
			place: true,
			date: localDate('r.created_at'),
			occurredAt: 'r.created_at',
			label: 'r.habitat_name',
			// A habitat *is* the site, so it names no other one.
			placeName: NO_TEXT,
			refId: 'r.habitat_type_id::text',
			detail: habitatStatusSql('r'),
			tagIds: recordTagIdsSql('r', 'habitat'),
		},
		inspection: {
			category: 'inspection',
			family: 'larval',
			table: 'inspections',
			joins: SITE_JOINS,
			date: 'r.inspection_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			placeName: PLACE_NAME,
			refId: 'r.habitat_type_id::text',
			// What the explorer's badge reads: dry, or how much was found.
			detail: inspectionResultSql('r'),
			// And what its strip reads, which is the one thing neither the density
			// nor the dot says: which stages were in the water.
			stages: lifeStageCodesSql('r'),
		},
		trap: {
			category: 'trap',
			family: 'adult',
			table: 'traps',
			place: true,
			date: localDate('r.created_at'),
			occurredAt: 'r.created_at',
			label: trapLabelSql('r'),
			placeName: NO_TEXT,
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
			placeName: trapLabelSql('t'),
			refId: 'r.collection_method_id::text',
			// All four states rather than the two exceptional ones. The explorer
			// paints its dot with the same resolution, and a log saying nothing
			// where that dot says "Trap out" is the two surfaces disagreeing.
			detail: collectionStatusSql('r'),
			hasBycatch: 'r.has_bycatch',
		},
		application: {
			category: 'application',
			family: 'control',
			table: 'applications',
			joins: SITE_JOINS,
			date: 'r.application_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			placeName: PLACE_NAME,
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
			placeName: PLACE_NAME,
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
			placeName: PLACE_NAME,
			refId: 'r.biocontrol_method_id::text',
			amount: 'r.amount_released',
			unitId: 'r.release_unit_id::text',
			// The same two arms `controlContext` reads on the client, over the two
			// columns the table has. Biocontrol names no collection.
			context: `case when r.habitat_id is not null or r.inspection_id is not null
				then 'larval' else 'standalone' end`,
		},
		outreach: {
			category: 'outreach',
			family: 'publicEngagement',
			table: 'outreach_actions',
			joins: ADDRESS_JOIN,
			date: 'r.outreach_date',
			occurredAt: NO_TIMESTAMP,
			label: NO_TEXT,
			placeName: ADDRESS_NAME,
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
			placeName: ADDRESS_NAME,
			// Requests carry no method or type lookup; the intake type is a column.
			refId: NO_TEXT,
			detail: `case when r.closed_at is null then 'open' else 'closed' end`,
			tagIds: recordTagIdsSql('r', 'service_request'),
		},
	};
}

export type RecordShapes = ReturnType<typeof recordShapes>;

/**
 * The {@link ActivityRecordRow} columns of one shape, for a select whose record
 * table is aliased `r` and whose `from` carries the shape's `joins`.
 *
 * Every literal is cast: a `union all` takes its column types from the first
 * branch, and an uncast literal arrives as `unknown`, which makes the branch
 * order load-bearing for no reason. The moment is a parameter rather than read
 * off the shape because a two-moment kind can date one record two ways; a
 * reader with one moment per record passes the shape's own.
 */
export function recordColumns(
	shape: RecordShape,
	moment: { readonly date: string; readonly occurredAt: string },
): RawBuilder<unknown> {
	return sql`
		${shape.category}::text as category,
		${shape.family}::text as family,
		r.id::text as id,
		r.lat,
		r.lng,
		to_char(${sql.raw(moment.date)}, 'YYYY-MM-DD') as date,
		to_char(
			(${sql.raw(moment.occurredAt)}) at time zone 'UTC',
			'YYYY-MM-DD"T"HH24:MI:SS"Z"'
		) as "occurredAt",
		${sql.raw(shape.label)} as label,
		${sql.raw(shape.placeName)} as "placeName",
		${sql.raw(shape.refId)} as "refId",
		${sql.raw(shape.methodRefId ?? NO_TEXT)} as "methodRefId",
		${sql.raw(shape.amount ?? NO_NUMBER)} as amount,
		${sql.raw(shape.unitId ?? NO_TEXT)} as "unitId",
		${sql.raw(shape.detail ?? NO_TEXT)} as detail,
		${sql.raw(shape.stages ?? NO_TEXT)} as stages,
		${sql.raw(shape.context ?? NO_TEXT)} as context,
		${sql.raw(shape.hasBycatch ?? NO_FLAG)} as "hasBycatch",
		${sql.raw(shape.tagIds ?? NO_TEXT_ARRAY)} as "tagIds"
	`;
}
