import { type ActivityFamily, OPERATIONAL_ACTIVITY_FAMILIES } from '@simmer-mosquito/domain';
import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';
import {
	type ActivityRecordRow,
	type RecordShape,
	recordColumns,
	recordShapes,
} from './profile-activity.js';
import { assertIanaTimeZone } from './record-display-sql.js';

/**
 * One record near a service request: the same columns the profile-activity
 * endpoint answers for that record kind, plus how far away it is.
 *
 * The per-category select is read off the activity reader's `RecordShape`
 * register rather than written again here, so a nearby row and an activity row
 * for one record carry one set of columns and the client draws both through
 * the same list row. This module used to hold a thinner copy, one label, one
 * ref and one status token per category, and the two had drifted by the time
 * the activity row grew a place name and a life-stage strip (#1086).
 */
export interface NearbyRecordRow extends ActivityRecordRow {
	/** Spheroidal distance from the request, in meters. */
	readonly distanceMeters: number;
}

/**
 * The families the view reads when a caller names none: the three operational
 * ones, which is what it answered before it could return other requests. The
 * fourth, `publicEngagement`, is the outreach actions and the other requests
 * around this one.
 */
export const DEFAULT_NEARBY_FAMILIES: readonly ActivityFamily[] = OPERATIONAL_ACTIVITY_FAMILIES;

export interface NearbyRecordsInput {
	readonly organizationId: string;
	/**
	 * The request the view is centred on. Its id is what keeps it out of its own
	 * result: the public-engagement family reads `service_requests`, and the
	 * nearest request to a request is always itself.
	 */
	readonly request: { readonly id: string; readonly lat: number; readonly lng: number };
	readonly radiusMeters: number;
	/** Inclusive lower bound on the dated kinds' dates (`YYYY-MM-DD`). */
	readonly dateFrom: string;
	/** Inclusive upper bound on the dated kinds' dates (`YYYY-MM-DD`). */
	readonly dateTo: string;
	/**
	 * The organization's IANA timezone, which decides the calendar day a
	 * collection's `collected_at` instant fell on. The other kinds are dated by
	 * plain `date` columns and need no conversion.
	 */
	readonly timeZone: string;
	/**
	 * Which families to read. An empty list reads nothing and answers with no
	 * round-trip, since a `union all` of zero branches is not a query.
	 */
	readonly families: readonly ActivityFamily[];
	/** Safety cap on total rows returned across all categories. */
	readonly limit?: number;
}

const DEFAULT_NEARBY_LIMIT = 2000;

/**
 * Records within `radiusMeters` of a request, in the families asked for and,
 * for the dated kinds, within `[dateFrom, dateTo]`, in one round-trip. Distance
 * is spheroidal (`geography`); each branch is org-scoped and soft-delete
 * filtered. Ordered nearest-first and capped for safety.
 */
export async function listNearbyRecords(
	db: Kysely<SimmerDatabase>,
	input: NearbyRecordsInput,
): Promise<NearbyRecordRow[]> {
	const families = new Set(input.families);
	const shapes = Object.values(recordShapes(assertIanaTimeZone(input.timeZone))).filter((shape) =>
		families.has(shape.family),
	);
	if (shapes.length === 0) {
		return [];
	}

	const limit = input.limit ?? DEFAULT_NEARBY_LIMIT;
	const result = await sql<NearbyRecordRow>`
		with center as (
			select st_setsrid(st_makepoint(${input.request.lng}, ${input.request.lat}), 4326)::geography as g
		)
		${sql.join(
			shapes.map((shape) => nearbySelect(shape, input)),
			sql` union all `,
		)}
		order by "distanceMeters" asc
		limit ${limit}
	`.execute(db);

	return result.rows.map((row) => ({
		...row,
		lat: Number(row.lat),
		lng: Number(row.lng),
		distanceMeters: Number(row.distanceMeters),
		// `numeric` arrives as a string over the wire, and a quantity rendered as
		// one formats wrong rather than failing.
		amount: row.amount === null ? null : Number(row.amount),
	}));
}

/** One branch of the union: a shape's columns, its distance, and the radius predicate. */
function nearbySelect(shape: RecordShape, input: NearbyRecordsInput): RawBuilder<NearbyRecordRow> {
	// A place is within the radius whenever it exists, so the window is over the
	// dated kinds only. The register dates a place by the day its record was
	// created, and that day still rides along on the row.
	const windowed = shape.place !== true;
	return sql<NearbyRecordRow>`
		select ${recordColumns(shape, { date: shape.date, occurredAt: shape.occurredAt })},
			st_distance(r.geom::geography, center.g) as "distanceMeters"
		from ${sql.raw(shape.table)} r
		${shape.joins === undefined ? sql`` : sql.raw(shape.joins)}
		cross join center
		where r.organization_id = ${input.organizationId}
			and r.deleted_at is null
			and st_dwithin(r.geom::geography, center.g, ${input.radiusMeters})
			${
				windowed
					? sql`and (${sql.raw(shape.date)}) between ${input.dateFrom}::date and ${input.dateTo}::date`
					: sql``
			}
			${shape.category === 'serviceRequest' ? sql`and r.id <> ${input.request.id}` : sql``}
	`;
}

export interface ServiceRequestCenter {
	readonly lat: number;
	readonly lng: number;
	/** The request's operational date (`YYYY-MM-DD`), the time-window anchor. */
	readonly requestDate: string;
}

/** The center point + request date for one org-owned service request, or undefined. */
export async function getServiceRequestCenter(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly id: string },
): Promise<ServiceRequestCenter | undefined> {
	const result = await sql<{
		readonly lat: number;
		readonly lng: number;
		readonly requestDate: string;
	}>`
		select r.lat, r.lng, to_char(r.request_date, 'YYYY-MM-DD') as "requestDate"
		from service_requests r
		where r.id = ${input.id}
			and r.organization_id = ${input.organizationId}
			and r.deleted_at is null
		limit 1
	`.execute(db);

	const row = result.rows[0];
	return row === undefined
		? undefined
		: { lat: Number(row.lat), lng: Number(row.lng), requestDate: row.requestDate };
}

/** The raw JSONB settings document for an organization (resolved by the domain layer). */
export async function getOrganizationSettingsRaw(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string },
): Promise<unknown> {
	const result = await sql<{ readonly settings: unknown }>`
		select o.settings from organizations o where o.id = ${input.organizationId} limit 1
	`.execute(db);

	return result.rows[0]?.settings ?? null;
}
