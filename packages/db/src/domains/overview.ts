/**
 * The period-in-review pages' server half: `GET /overview/:grain`, one read
 * for Today, Monthly and Annual. `docs/today-spec.md`, "The reader", is the
 * brief.
 *
 * SQL plus a call. One statement per record type, run in `Promise.all` the
 * way `/dashboard` runs its three, each an index-backed scan of the type's
 * `(organization_id, <date> desc, created_at desc) where deleted_at is null`
 * index returning rows grouped by calendar day in the Organization's zone.
 * The columns and the series are then `aggregateOverview` in the domain, a
 * pure function over those rows, so the cut arithmetic has a suite with no
 * database and nothing here decides a window.
 *
 * The daily row is one shape. Inspections return the positive count beside
 * the count, collections return the mosquitoes over the collections that
 * count, so a ratio row is derived from the same rows as the count row beside
 * it and the two cannot disagree. Samples have no date of their own and join
 * their inspection; a collection's effective date is a `coalesce` no index
 * serves, and the table is 31k rows.
 *
 * `earliest` and `recordedEver` come from a separate `min(date)` per type,
 * eight index reads in the same `Promise.all`. A union over the eight types
 * was not taken, because each has its own predicate and join.
 */

import {
	aggregateOverview,
	OVERVIEW_RECORD_TYPES,
	type OverviewDailyRow,
	type OverviewGrain,
	type OverviewRecordType,
	type OverviewResponse,
	overviewScanWindow,
	parseOverviewPeriod,
} from '@simmer-mosquito/domain';
import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';
import { collectionEffectiveDateExpr } from './adult-surveillance.js';
import { readOrganizationToday } from './dashboard.js';
import { assertIanaTimeZone } from './record-display-sql.js';

export interface OverviewInput {
	readonly organizationId: string;
	/** The organization's IANA timezone, which names the day every row falls on. */
	readonly timeZone: string;
	readonly grain: OverviewGrain;
	/** The period as the request spelled it; absent is the current period. */
	readonly period?: string | undefined;
}

/** A period the route answers 400 `overview_period_invalid` for. */
export class OverviewPeriodInvalidError extends Error {
	constructor(grain: OverviewGrain, period: string) {
		super(`Not a ${grain} period on or before today: ${period}`);
		this.name = 'OverviewPeriodInvalidError';
	}
}

/**
 * One period at one grain for one organization, as of now in its zone.
 * Throws `OverviewPeriodInvalidError` on a malformed or future period.
 */
export async function readOverview(
	db: Kysely<SimmerDatabase>,
	input: OverviewInput,
): Promise<OverviewResponse> {
	const timeZone = assertIanaTimeZone(input.timeZone);
	const today = await readOrganizationToday(db, timeZone);
	const period = parseOverviewPeriod(input.grain, input.period, today);
	if (period === null) {
		throw new OverviewPeriodInvalidError(input.grain, input.period ?? '');
	}

	const window = overviewScanWindow(input.grain, period, today);
	const scope: Scope = { organizationId: input.organizationId, timeZone, window };

	const [rowLists, minima] = await Promise.all([
		Promise.all(OVERVIEW_RECORD_TYPES.map((type) => readDailyRows(db, type, scope))),
		Promise.all(OVERVIEW_RECORD_TYPES.map((type) => readEarliest(db, type, scope))),
	]);

	return aggregateOverview({
		grain: input.grain,
		period,
		today,
		rows: perType(rowLists),
		earliest: perType(minima),
	});
}

function perType<T>(values: readonly T[]): Readonly<Record<OverviewRecordType, T>> {
	const record = {} as Record<OverviewRecordType, T>;
	OVERVIEW_RECORD_TYPES.forEach((type, index) => {
		record[type] = values[index] as T;
	});
	return record;
}

interface Scope {
	readonly organizationId: string;
	readonly timeZone: string;
	readonly window: { readonly from: string | null; readonly to: string };
}

/**
 * The `from` and `where` of one type's statement: the table under its alias,
 * the date it is counted on, and its live-row predicate, organization scope
 * included. The date is an expression rather than a column because a sample
 * is counted on its parent inspection's date and a collection on a coalesce.
 */
interface TypeSource {
	readonly from: RawBuilder<unknown>;
	readonly date: RawBuilder<unknown>;
	readonly live: (organizationId: string) => RawBuilder<boolean>;
}

function typeSource(type: OverviewRecordType, timeZone: string): TypeSource {
	switch (type) {
		case 'inspections':
			return {
				from: sql`inspections i`,
				date: sql`i.inspection_date`,
				live: (organizationId) =>
					sql<boolean>`i.organization_id = ${organizationId} and i.deleted_at is null`,
			};
		case 'samples':
			return {
				from: sql`samples s join inspections i on i.id = s.inspection_id`,
				date: sql`i.inspection_date`,
				live: (organizationId) =>
					sql<boolean>`s.organization_id = ${organizationId} and s.deleted_at is null and i.deleted_at is null`,
			};
		case 'collections': {
			const effectiveDate = collectionEffectiveDateExpr(timeZone);
			return {
				from: sql`collections c`,
				date: effectiveDate,
				// Undated means counted nowhere, as on the Dashboard.
				live: (organizationId) =>
					sql<boolean>`c.organization_id = ${organizationId} and c.deleted_at is null and ${effectiveDate} is not null`,
			};
		}
		case 'applications':
			return {
				from: sql`applications a`,
				date: sql`a.application_date`,
				live: (organizationId) =>
					sql<boolean>`a.organization_id = ${organizationId} and a.deleted_at is null`,
			};
		case 'sourceReductions':
			return {
				from: sql`source_reductions sr`,
				date: sql`sr.source_reduction_date`,
				live: (organizationId) =>
					sql<boolean>`sr.organization_id = ${organizationId} and sr.deleted_at is null`,
			};
		case 'releases':
			return {
				from: sql`biocontrol_actions b`,
				date: sql`b.biocontrol_date`,
				live: (organizationId) =>
					sql<boolean>`b.organization_id = ${organizationId} and b.deleted_at is null`,
			};
		case 'serviceRequests':
			return {
				from: sql`service_requests q`,
				date: sql`q.request_date`,
				live: (organizationId) =>
					sql<boolean>`q.organization_id = ${organizationId} and q.deleted_at is null`,
			};
		case 'outreachActions':
			return {
				from: sql`outreach_actions o`,
				date: sql`o.outreach_date`,
				live: (organizationId) =>
					sql<boolean>`o.organization_id = ${organizationId} and o.deleted_at is null`,
			};
	}
}

/**
 * A Positive Inspection over `inspections i`: wet and indicating breeding,
 * `density <> 'none' or larvae_count > 0`, the larval doc's own rule, which
 * holds under all three density policies where "any band above none" misses
 * a `count_and_dips_required` Organization that stores no density.
 */
const positiveInspection = sql<boolean>`(i.is_wet and (i.density <> 'none' or i.larvae_count > 0))`;

/**
 * A collection that counts toward mosquitoes per collection, over
 * `collections c`: no problem, and either declared a zero result or carrying
 * at least one live species row. A problem collection with species rows is a
 * partial catch from a trap that failed, and an awaiting collection is neither
 * a zero nor a divisor.
 */
const countedCollection = sql<boolean>`(
	c.has_problem = false
	and (
		c.is_zero_result
		or exists (
			select 1 from collection_species cs
			where cs.collection_id = c.id and cs.deleted_at is null
		)
	)
)`;

/** The mosquitoes a counted collection carries: every live species row's count, both sexes and every status. */
const collectionMosquitoes = sql<number>`(
	select coalesce(sum(cs.count), 0)
	from collection_species cs
	where cs.collection_id = c.id and cs.deleted_at is null
)`;

/** The two extra sums the ratio-bearing types carry beside their count. */
function ratioColumns(type: OverviewRecordType): RawBuilder<unknown> {
	switch (type) {
		case 'inspections':
			return sql`, count(*) filter (where ${positiveInspection})::int as numerator, count(*)::int as denominator`;
		case 'collections':
			return sql`, coalesce(sum(case when ${countedCollection} then ${collectionMosquitoes} else 0 end), 0)::int as numerator, count(*) filter (where ${countedCollection})::int as denominator`;
		default:
			return sql``;
	}
}

async function readDailyRows(
	db: Kysely<SimmerDatabase>,
	type: OverviewRecordType,
	scope: Scope,
): Promise<readonly OverviewDailyRow[]> {
	const source = typeSource(type, scope.timeZone);
	const lowerBound =
		scope.window.from === null ? sql`` : sql`and ${source.date} >= ${scope.window.from}::date`;
	const result = await sql<OverviewDailyRow>`
		select ${source.date}::text as day, count(*)::int as count ${ratioColumns(type)}
		from ${source.from}
		where ${source.live(scope.organizationId)}
			${lowerBound}
			and ${source.date} <= ${scope.window.to}::date
		group by 1
		order by 1
	`.execute(db);
	return result.rows;
}

/** The type's earliest dated live record, or null when it has none. */
async function readEarliest(
	db: Kysely<SimmerDatabase>,
	type: OverviewRecordType,
	scope: Scope,
): Promise<string | null> {
	const source = typeSource(type, scope.timeZone);
	const result = await sql<{ readonly earliest: string | null }>`
		select min(${source.date})::text as earliest
		from ${source.from}
		where ${source.live(scope.organizationId)}
	`.execute(db);
	return result.rows[0]?.earliest ?? null;
}
