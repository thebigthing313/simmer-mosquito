/**
 * The Dashboard's server half: every panel on `/` whose predicate needs a
 * second table to decide membership, or a count over a window, in one read.
 *
 * `docs/dashboard-spec.md` is the brief. The rule from its read ticket: a panel
 * whose predicate is one table's own columns reads Electric on the client, and
 * everything else is here. That is the two awaiting queues, the unassigned
 * requests queue, the untreated habitats flag, the eight-type activity strip
 * with its existence checks, and the people in the field today.
 *
 * Each predicate that an explorer also filters by is the explorer's fragment
 * rather than a copy: `sampleAwaitingCondition`, `collectionAwaitingCondition`
 * and `untreatedInspectionDateSql` are read from the surfaces that own them, so
 * the count on the page and the rows behind its link cannot disagree. The
 * people table wraps `activityBranches`, the Activity Monitor's union, rather
 * than restating seventeen branches.
 *
 * Today is `now()` in the organization's zone, read once and handed to every
 * window, so the strip's title and its counts come from one clock. The
 * untreated fragment reads `now()` itself, which is the same clock a request
 * later; a read that straddles midnight is the one case the two can differ.
 */

import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';
import { collectionAwaitingCondition, collectionEffectiveDateExpr } from './adult-surveillance.js';
import { untreatedInspectionDateSql } from './habitats.js';
import { sampleAwaitingCondition } from './larval-surveillance.js';
import { activityBranches } from './profile-activity.js';
import { assertIanaTimeZone, localDateSql } from './record-display-sql.js';

export interface DashboardInput {
	readonly organizationId: string;
	/** The organization's IANA timezone, which names the day every window ends on. */
	readonly timeZone: string;
}

/** A pending queue: how many, and how old the oldest is. */
export interface QueueCount {
	readonly count: number;
	/** The oldest pending row's date, `YYYY-MM-DD`; null when the count is 0. */
	readonly oldest: string | null;
}

/** One type's count over the rolling window, beside the same count for the 7 days before. */
export interface ActivityCount {
	readonly count: number;
	readonly prior: number;
}

/** One person's day: how much they logged and when they last logged something. */
export interface PersonToday {
	readonly profileId: string;
	readonly records: number;
	/** ISO instant of the latest record. */
	readonly lastAt: string;
}

/** A `YYYY-MM-DD` pair, both ends inclusive. */
export interface DateWindow {
	readonly from: string;
	readonly to: string;
}

/**
 * The eight activity types in strip order. A key here is a cell on the page,
 * and the client hides the cell when the type is `null`, which is a type the
 * organization has never recorded.
 */
export const ACTIVITY_TYPE_KEYS = [
	'inspections',
	'samples',
	'collections',
	'applications',
	'sourceReductions',
	'releases',
	'serviceRequests',
	'outreachActions',
] as const;

export type ActivityTypeKey = (typeof ACTIVITY_TYPE_KEYS)[number];

export interface DashboardResponse {
	/** `YYYY-MM-DD` in the organization's zone. */
	readonly today: string;
	readonly queues: {
		readonly samplesAwaiting: QueueCount;
		readonly collectionsAwaiting: QueueCount;
		readonly requestsUnassigned: QueueCount;
	};
	readonly untreatedHabitats: QueueCount;
	readonly activity: {
		readonly window: DateWindow;
		readonly priorWindow: DateWindow;
		readonly types: Readonly<Record<ActivityTypeKey, ActivityCount | null>>;
	};
	readonly peopleToday: readonly PersonToday[];
}

/** The rolling window the strip counts over: today and the six days before. */
export const ACTIVITY_WINDOW_DAYS = 7;

/**
 * Every server panel on the Dashboard, for one organization, as of now in its
 * zone.
 */
export async function readDashboard(
	db: Kysely<SimmerDatabase>,
	input: DashboardInput,
): Promise<DashboardResponse> {
	const timeZone = assertIanaTimeZone(input.timeZone);
	const organizationId = input.organizationId;
	const today = await readToday(db, timeZone);
	const window = { from: addDays(today, -(ACTIVITY_WINDOW_DAYS - 1)), to: today };
	const priorWindow = {
		from: addDays(window.from, -ACTIVITY_WINDOW_DAYS),
		to: addDays(window.from, -1),
	};

	const [
		samplesAwaiting,
		collectionsAwaiting,
		requestsUnassigned,
		untreatedHabitats,
		types,
		peopleToday,
	] = await Promise.all([
		readSamplesAwaiting(db, organizationId),
		readCollectionsAwaiting(db, organizationId, timeZone),
		readRequestsUnassigned(db, organizationId, timeZone),
		readUntreatedHabitats(db, organizationId, timeZone),
		readActivity(db, organizationId, timeZone, window, priorWindow),
		readPeopleToday(db, organizationId, timeZone, today),
	]);

	return {
		today,
		queues: { samplesAwaiting, collectionsAwaiting, requestsUnassigned },
		untreatedHabitats,
		activity: { window, priorWindow, types },
		peopleToday,
	};
}

/** Today in the organization's zone, from the database's clock. */
async function readToday(db: Kysely<SimmerDatabase>, timeZone: string): Promise<string> {
	const result = await sql<{ readonly today: string }>`
		select ${sql.raw(localDateSql('now()', timeZone))}::text as today
	`.execute(db);
	const today = result.rows[0]?.today;
	if (today === undefined) {
		throw new Error('The database answered no date for today.');
	}
	return today;
}

/**
 * `YYYY-MM-DD` plus a number of days, in calendar arithmetic. UTC throughout,
 * because the input is already a calendar day and no zone should move it.
 */
function addDays(date: string, days: number): string {
	const instant = new Date(`${date}T00:00:00Z`);
	instant.setUTCDate(instant.getUTCDate() + days);
	return instant.toISOString().slice(0, 10);
}

interface QueueRow {
	readonly count: number;
	readonly oldest: string | null;
}

function toQueueCount(row: QueueRow | undefined): QueueCount {
	return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
}

/** Samples awaiting identification, all time, oldest by the parent inspection's date. */
async function readSamplesAwaiting(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
): Promise<QueueCount> {
	const result = await sql<QueueRow>`
		select count(*)::int as count, min(i.inspection_date)::text as oldest
		from samples s
		join inspections i on i.id = s.inspection_id
		where s.organization_id = ${organizationId}
			and s.deleted_at is null
			and ${sampleAwaitingCondition}
	`.execute(db);
	return toQueueCount(result.rows[0]);
}

/** Collections awaiting identification, all time, oldest by effective date. */
async function readCollectionsAwaiting(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	timeZone: string,
): Promise<QueueCount> {
	const effectiveDate = collectionEffectiveDateExpr(timeZone);
	const result = await sql<QueueRow>`
		select count(*)::int as count, min(${effectiveDate})::text as oldest
		from collections c
		where c.organization_id = ${organizationId}
			and c.deleted_at is null
			and ${collectionAwaitingCondition(effectiveDate)}
	`.execute(db);
	return toQueueCount(result.rows[0]);
}

/**
 * Open requests for control no live stop on a scheduled or in-progress mission
 * names, all time, oldest by the day they were requested.
 *
 * The assignment rule is `CONTEXT.md`'s (#989): a stop on a completed or
 * cancelled mission leaves the request unassigned again, so it comes back onto
 * this queue. The client's `useAssignedRequestIds` reads the same rule over the
 * synced rows for the explorer's `unassigned` filter.
 */
async function readRequestsUnassigned(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	timeZone: string,
): Promise<QueueCount> {
	const requestedOn = sql.raw(localDateSql('rca.requested_at', timeZone));
	const result = await sql<QueueRow>`
		select count(*)::int as count, min(${requestedOn})::text as oldest
		from requested_control_actions rca
		where rca.organization_id = ${organizationId}
			and rca.deleted_at is null
			and rca.resolved_at is null
			and not exists (
				select 1
				from mission_items mi
				join missions m on m.id = mi.mission_id
				where mi.requested_control_action_id = rca.id
					and mi.deleted_at is null
					and m.deleted_at is null
					and m.completed_at is null
					and m.cancelled_at is null
			)
	`.execute(db);
	return toQueueCount(result.rows[0]);
}

/**
 * Untreated habitats, and the date of the oldest heavy reading among them.
 *
 * One lateral over the scalar subquery so the date is computed once per
 * habitat, tested for null, and aggregated, rather than the subquery written
 * twice.
 */
async function readUntreatedHabitats(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	timeZone: string,
): Promise<QueueCount> {
	const result = await sql<QueueRow>`
		select count(*)::int as count, min(u.inspection_date)::text as oldest
		from habitats h
		cross join lateral (
			select ${untreatedInspectionDateSql(timeZone)} as inspection_date
		) u
		where h.organization_id = ${organizationId}
			and h.deleted_at is null
			and u.inspection_date is not null
	`.execute(db);
	return toQueueCount(result.rows[0]);
}

/**
 * How one activity type is counted: the rows it is, and the date each is
 * counted on. Every shape aliases its own table `r`.
 */
interface ActivityShape {
	readonly key: ActivityTypeKey;
	/** The from-clause: the table as `r`, plus any join the date needs. */
	readonly from: RawBuilder<unknown>;
	/** Predicates beyond organization scope and `r.deleted_at`, for the joined row. */
	readonly alwaysWhere?: RawBuilder<boolean>;
	/** The operational date, as a `date` expression. */
	readonly date: RawBuilder<unknown>;
}

/**
 * The eight types, each counted on the date its own overview and the Activity
 * Monitor count it on. Every column is an operational date a person typed;
 * `request_date` over `created_at` for service requests is #992's decision,
 * and `docs/dashboard-spec.md` carries the reason.
 */
function activityShapes(timeZone: string): readonly ActivityShape[] {
	return [
		{ key: 'inspections', from: sql`inspections r`, date: sql`r.inspection_date` },
		{
			key: 'samples',
			// A sample has no date of its own, so it is counted on its parent's.
			from: sql`samples r join inspections i on i.id = r.inspection_id`,
			alwaysWhere: sql<boolean>`i.deleted_at is null`,
			date: sql`i.inspection_date`,
		},
		{
			key: 'collections',
			from: sql`collections r`,
			// The effective date, the same expression every collection read uses.
			// A collection with neither date is undated and falls out of any window.
			date: sql.raw(`coalesce(${localDateSql('r.collected_at', timeZone)}, r.collection_date)`),
		},
		{ key: 'applications', from: sql`applications r`, date: sql`r.application_date` },
		{
			key: 'sourceReductions',
			from: sql`source_reductions r`,
			date: sql`r.source_reduction_date`,
		},
		{ key: 'releases', from: sql`biocontrol_actions r`, date: sql`r.biocontrol_date` },
		{ key: 'serviceRequests', from: sql`service_requests r`, date: sql`r.request_date` },
		{ key: 'outreachActions', from: sql`outreach_actions r`, date: sql`r.outreach_date` },
	];
}

interface ActivityRow {
	readonly key: ActivityTypeKey;
	readonly count: number;
	readonly prior: number;
	/** Whether the organization has any live row of this type at all. */
	readonly present: boolean;
}

/**
 * The strip's eight cells in one round-trip: a `union all` of one aggregate
 * per type, each counting both windows with a filtered `count` and asking
 * whether the type exists for the organization at all.
 *
 * Both windows are compared as `date` bounds, which is what makes a `date`
 * column and a `timestamptz` reduced through `localDateSql` compare the same
 * way.
 */
async function readActivity(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	timeZone: string,
	window: DateWindow,
	priorWindow: DateWindow,
): Promise<Readonly<Record<ActivityTypeKey, ActivityCount | null>>> {
	const branches = activityShapes(timeZone).map(
		(shape) => sql<ActivityRow>`
			select
				${shape.key}::text as key,
				count(*) filter (
					where (${shape.date}) between ${window.from}::date and ${window.to}::date
				)::int as count,
				count(*) filter (
					where (${shape.date}) between ${priorWindow.from}::date and ${priorWindow.to}::date
				)::int as prior,
				count(*) > 0 as present
			from ${shape.from}
			where r.organization_id = ${organizationId}
				and r.deleted_at is null
				${shape.alwaysWhere === undefined ? sql`` : sql`and ${shape.alwaysWhere}`}
		`,
	);
	const result = await sql<ActivityRow>`${sql.join(branches, sql` union all `)}`.execute(db);

	const byKey = new Map(result.rows.map((row) => [row.key, row]));
	const types = {} as Record<ActivityTypeKey, ActivityCount | null>;
	for (const key of ACTIVITY_TYPE_KEYS) {
		const row = byKey.get(key);
		types[key] = row === undefined || !row.present ? null : { count: row.count, prior: row.prior };
	}
	return types;
}

/**
 * Everyone who logged field work today, most records first.
 *
 * The Activity Monitor's seventeen branches with no Profile predicate, grouped
 * by the Profile each entry is attributed to. Same field attribution and the
 * same date rule, so a row's number is what its link to `/daily-work` opens.
 */
async function readPeopleToday(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	timeZone: string,
	today: string,
): Promise<readonly PersonToday[]> {
	const branches = activityBranches({ organizationId, timeZone, dateFrom: today, dateTo: today });
	const result = await sql<PersonToday>`
		select
			entries."profileId",
			count(*)::int as records,
			max(entries."recordedAt") as "lastAt"
		from (${sql.join(branches, sql` union all `)}) entries
		group by entries."profileId"
		order by records desc, "lastAt" desc, entries."profileId"
	`.execute(db);
	return result.rows;
}
