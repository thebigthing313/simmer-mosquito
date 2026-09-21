/**
 * The Dashboard's server half: every panel on `/` whose predicate needs a
 * second table to decide membership, or a count over a window, in one read.
 *
 * `docs/dashboard-spec.md` is the brief. The rule from its read ticket: a panel
 * whose predicate is one table's own columns reads Electric on the client, and
 * everything else is here. That is the two awaiting queues, the unassigned
 * requests queue, the untreated habitats flag, and the people in the field
 * today. The last-7-days strip is not here: it is windowed reads over eight
 * synced tables, so `useActivityStrip` in `apps/web` counts it off Electric.
 *
 * Each predicate that an explorer also filters by is the explorer's fragment
 * rather than a copy: `sampleAwaitingCondition`, `collectionAwaitingCondition`
 * and `untreatedInspectionDateSql` are read from the surfaces that own them, so
 * the count on the page and the rows behind its link cannot disagree. The
 * people table wraps `activityBranches`, the Activity Monitor's union, rather
 * than restating seventeen branches.
 *
 * Today is `now()` in the organization's zone, read once and handed to the
 * people read. The untreated fragment reads `now()` itself, which is the same
 * clock a request later; a read that straddles midnight is the one case the
 * two can differ.
 */

import { type Kysely, sql } from 'kysely';

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

/** One person's day: how much they logged and when they last logged something. */
export interface PersonToday {
	readonly profileId: string;
	readonly records: number;
	/** ISO instant of the latest record. */
	readonly lastAt: string;
}

export interface DashboardResponse {
	/** `YYYY-MM-DD` in the organization's zone. */
	readonly today: string;
	readonly queues: {
		readonly samplesAwaiting: QueueCount;
		readonly collectionsAwaiting: QueueCount;
		readonly requestsUnassigned: QueueCount;
	};
	readonly untreatedHabitats: QueueCount;
	readonly peopleToday: readonly PersonToday[];
}

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

	const [samplesAwaiting, collectionsAwaiting, requestsUnassigned, untreatedHabitats, peopleToday] =
		await Promise.all([
			readSamplesAwaiting(db, organizationId),
			readCollectionsAwaiting(db, organizationId, timeZone),
			readRequestsUnassigned(db, organizationId, timeZone),
			readUntreatedHabitats(db, organizationId, timeZone),
			readPeopleToday(db, organizationId, timeZone, today),
		]);

	return {
		today,
		queues: { samplesAwaiting, collectionsAwaiting, requestsUnassigned },
		untreatedHabitats,
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
