/**
 * The Dashboard's server half: every panel on `/` whose predicate needs a
 * second table to decide membership, or a count over a window, in one read.
 *
 * `docs/dashboard-spec.md` is the brief. The rule from its read ticket: a panel
 * whose predicate is one table's own columns reads Electric on the client, and
 * everything else is here. That is the two awaiting queues and the unassigned
 * requests queue. The last-7-days strip and the people in the field today are
 * not here: both are one day or one fortnight of synced rows, so
 * `useActivityStrip` and `useDayActivity` in `apps/web` read them off
 * Electric. The untreated habitats banner was here and is gone: its read was
 * a correlated subquery per habitat, 4.7 seconds on the production clone
 * against under 100 ms for everything else, and the flag is still the
 * habitats explorer's `untreated` filter.
 *
 * Each predicate that an explorer also filters by is the explorer's fragment
 * rather than a copy: `sampleAwaitingCondition` and
 * `collectionAwaitingCondition` are read from the surfaces that own them, so
 * the count on the page and the rows behind its link cannot disagree.
 *
 * Today is `now()` in the organization's zone, read once.
 */

import { type Kysely, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';
import { collectionAwaitingCondition, collectionEffectiveDateExpr } from './adult-surveillance.js';
import { sampleAwaitingCondition } from './larval-surveillance.js';
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

export interface DashboardResponse {
	/** `YYYY-MM-DD` in the organization's zone. */
	readonly today: string;
	readonly queues: {
		readonly samplesAwaiting: QueueCount;
		readonly collectionsAwaiting: QueueCount;
		readonly requestsUnassigned: QueueCount;
	};
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
	const today = await readOrganizationToday(db, timeZone);

	const [samplesAwaiting, collectionsAwaiting, requestsUnassigned] = await Promise.all([
		readSamplesAwaiting(db, organizationId),
		readCollectionsAwaiting(db, organizationId, timeZone),
		readRequestsUnassigned(db, organizationId, timeZone),
	]);

	return { today, queues: { samplesAwaiting, collectionsAwaiting, requestsUnassigned } };
}

/**
 * Today in the organization's zone, from the database's clock. The overview
 * reader asks the same question, so it is exported rather than copied.
 */
export async function readOrganizationToday(
	db: Kysely<SimmerDatabase>,
	timeZone: string,
): Promise<string> {
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
