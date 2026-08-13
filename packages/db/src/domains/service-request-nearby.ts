import { type Kysely, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';
import {
	assertIanaTimeZone,
	habitatStatusSql,
	inspectionResultSql,
	localDateSql,
	trapLabelSql,
	trapStatusSql,
} from './record-display-sql.js';

/**
 * The operational record kinds a service-request context view surfaces around a
 * request. Grouped downstream into infrastructure (habitat, trap), surveillance
 * (inspection, collection), and control (application, sourceReduction,
 * biocontrol).
 */
export type NearbyCategory =
	| 'habitat'
	| 'trap'
	| 'inspection'
	| 'collection'
	| 'application'
	| 'sourceReduction'
	| 'biocontrol';

export interface NearbyRecordRow {
	readonly category: NearbyCategory;
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	/** Great-circle distance from the request, in meters. */
	readonly distanceMeters: number;
	/** Operational date (`YYYY-MM-DD`) for the temporal kinds; null for infrastructure. */
	readonly date: string | null;
	/** The record's own name when it has one (habitat/trap); null otherwise. */
	readonly label: string | null;
	/** A related lookup id the client resolves to a name (type/method/insecticide). */
	readonly refId: string | null;
	/** A compact status token for list badges and per-record styling. */
	readonly status: string | null;
}

export interface NearbyRecordsInput {
	readonly organizationId: string;
	readonly center: { readonly lat: number; readonly lng: number };
	readonly radiusMeters: number;
	/** Inclusive lower bound on the temporal kinds' dates (`YYYY-MM-DD`). */
	readonly dateFrom: string;
	/** Inclusive upper bound on the temporal kinds' dates (`YYYY-MM-DD`). */
	readonly dateTo: string;
	/**
	 * The agency's IANA timezone, which decides the calendar day a collection's
	 * `collected_at` instant fell on. The other six kinds are dated by plain
	 * `date` columns and need no conversion.
	 */
	readonly timeZone: string;
	/** Safety cap on total rows returned across all categories. */
	readonly limit?: number;
}

const DEFAULT_NEARBY_LIMIT = 2000;

/**
 * Records within `radiusMeters` of a point (and, for the temporal kinds, within
 * `[dateFrom, dateTo]`), across the seven operational record types, in one
 * round-trip. Distance is spheroidal (`geography`); each table is org-scoped and
 * soft-delete-filtered. Ordered nearest-first and capped for safety.
 */
export async function listNearbyRecords(
	db: Kysely<SimmerDatabase>,
	input: NearbyRecordsInput,
): Promise<NearbyRecordRow[]> {
	const { organizationId: org, radiusMeters, dateFrom, dateTo } = input;
	const limit = input.limit ?? DEFAULT_NEARBY_LIMIT;
	// A collection is dated by an instant or by a plain date, depending on the
	// agency's timing mode. The instant becomes a day in the agency's zone, not
	// the database server's — otherwise an evening's collection reads as, and
	// filters as, the next day. See localDateSql.
	const collectionDate = sql.raw(
		`coalesce(${localDateSql('c.collected_at', assertIanaTimeZone(input.timeZone))}, c.collection_date)`,
	);

	const result = await sql<NearbyRecordRow>`
		with center as (
			select st_setsrid(st_makepoint(${input.center.lng}, ${input.center.lat}), 4326)::geography as g
		)
		select 'habitat' as category, h.id, h.lat, h.lng,
			st_distance(h.geom::geography, center.g) as "distanceMeters",
			null::text as date, h.habitat_name as label, h.habitat_type_id::text as "refId",
			${sql.raw(habitatStatusSql('h'))} as status
		from habitats h cross join center
		where h.organization_id = ${org} and h.deleted_at is null
			and st_dwithin(h.geom::geography, center.g, ${radiusMeters})
		union all
		select 'trap', t.id, t.lat, t.lng,
			st_distance(t.geom::geography, center.g),
			null::text,
			${sql.raw(trapLabelSql('t'))},
			t.collection_method_id::text,
			${sql.raw(trapStatusSql('t'))}
		from traps t cross join center
		where t.organization_id = ${org} and t.deleted_at is null
			and st_dwithin(t.geom::geography, center.g, ${radiusMeters})
		union all
		select 'inspection', i.id, i.lat, i.lng,
			st_distance(i.geom::geography, center.g),
			to_char(i.inspection_date, 'YYYY-MM-DD'), null::text, null::text,
			${sql.raw(inspectionResultSql('i'))}
		from inspections i cross join center
		where i.organization_id = ${org} and i.deleted_at is null
			and st_dwithin(i.geom::geography, center.g, ${radiusMeters})
			and i.inspection_date between ${dateFrom}::date and ${dateTo}::date
		union all
		select 'collection', c.id, c.lat, c.lng,
			st_distance(c.geom::geography, center.g),
			to_char(${collectionDate}, 'YYYY-MM-DD'),
			null::text, c.collection_method_id::text,
			case when c.has_problem = true then 'problem' else null end
		from collections c cross join center
		where c.organization_id = ${org} and c.deleted_at is null
			and st_dwithin(c.geom::geography, center.g, ${radiusMeters})
			and ${collectionDate} between ${dateFrom}::date and ${dateTo}::date
		union all
		select 'application', a.id, a.lat, a.lng,
			st_distance(a.geom::geography, center.g),
			to_char(a.application_date, 'YYYY-MM-DD'), null::text, a.insecticide_id::text, null::text
		from applications a cross join center
		where a.organization_id = ${org} and a.deleted_at is null
			and st_dwithin(a.geom::geography, center.g, ${radiusMeters})
			and a.application_date between ${dateFrom}::date and ${dateTo}::date
		union all
		select 'sourceReduction', s.id, s.lat, s.lng,
			st_distance(s.geom::geography, center.g),
			to_char(s.source_reduction_date, 'YYYY-MM-DD'), null::text,
			s.source_reduction_method_id::text, null::text
		from source_reductions s cross join center
		where s.organization_id = ${org} and s.deleted_at is null
			and st_dwithin(s.geom::geography, center.g, ${radiusMeters})
			and s.source_reduction_date between ${dateFrom}::date and ${dateTo}::date
		union all
		select 'biocontrol', b.id, b.lat, b.lng,
			st_distance(b.geom::geography, center.g),
			to_char(b.biocontrol_date, 'YYYY-MM-DD'), null::text,
			b.biocontrol_method_id::text, null::text
		from biocontrol_actions b cross join center
		where b.organization_id = ${org} and b.deleted_at is null
			and st_dwithin(b.geom::geography, center.g, ${radiusMeters})
			and b.biocontrol_date between ${dateFrom}::date and ${dateTo}::date
		order by "distanceMeters" asc
		limit ${limit}
	`.execute(db);

	return result.rows.map((row) => ({
		...row,
		lat: Number(row.lat),
		lng: Number(row.lng),
		distanceMeters: Number(row.distanceMeters),
	}));
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
