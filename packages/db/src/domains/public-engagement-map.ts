import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { type RawBuilder, sql } from 'kysely';
import type { DbExecutor } from '../index.js';
import { dateWindowClauses } from './map-date-filter.js';
import type { MapTilesetLayer } from './map-layers.js';
import { regionMembershipClauses } from './map-region-filter.js';
import { searchClauses } from './map-search-filter.js';
import {
	type MapByIdInput,
	type MapDisplayColumns,
	type MapRecordSurfaceReaders,
	mapRecordSurface,
} from './map-surface.js';
import { tagMembershipClauses } from './map-tag-filter.js';

/**
 * A notification registration's drawn shape, read back by id.
 *
 * A by-id geometry read rather than the usual tile-list-extent trio, for the
 * same reason `requested_control_actions` has one: every other field of a
 * registration already streams on its Electric shape, and the shape carries the
 * centroid rather than the drawn line or area (ADR 0009). So the explorer draws
 * from the synced row and only the edit form needs this.
 *
 * It matters more here than on most records. A registration's geometry is not a
 * pin on a map of the record, it is the record: generation measures the buffer
 * from this shape to decide who a mission reaches. An edit form that opened
 * holding the centroid of a no-spray field and saved it back would silently turn
 * that field into a point.
 */
export interface SafeNotificationRegistrationGeometryRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly updatedAt: Date;
}

export async function getNotificationRegistrationGeometryById(
	db: DbExecutor,
	input: MapByIdInput,
): Promise<SafeNotificationRegistrationGeometryRow | undefined> {
	const result = await sql<SafeNotificationRegistrationGeometryRow>`
		select
			nr.id,
			nr.organization_id as "organizationId",
			nr.lat,
			nr.lng,
			nr.geojson,
			nr.geom_type as "geomType",
			nr.updated_at as "updatedAt"
		from notification_registrations nr
		where nr.id = ${input.id}
			and nr.organization_id = ${input.organizationId}
			and nr.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

// --- the service requests map surface ----------------------------------------

export interface ServiceRequestMapFilters {
	/**
	 * Open requests only when `true`, closed only when `false`, both when absent.
	 * A request is open until `closed_at` is stamped; deletion is a separate
	 * state the scope predicate already excludes.
	 */
	readonly isOpen?: boolean;
	/**
	 * Case-insensitive substring match on the request's title, `#<display_name>`,
	 * or its details. Those are the two fields the explorer's rail matched in the
	 * browser, so a search that found a request before finds it now.
	 */
	readonly search?: string;
	/** Match requests carrying any of these tag ids (polymorphic `tag_items`). */
	readonly tagIds?: readonly string[];
	/** Match requests falling inside any of these regions. */
	readonly regionIds?: readonly string[];
	/** Inclusive lower bound on `request_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `request_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

/**
 * A service request as the explorer rail lists it and the map card opens it.
 *
 * The contact and the address are ids rather than joined columns, because the
 * rail resolves both for the page it draws out of their on-demand collections
 * (`useRequestParties`), and a page of fifty ids is a subset those load
 * reliably. `closedAt` is the status: a request is open until it is stamped.
 */
export interface SafeServiceRequestDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly displayName: number | null;
	readonly intakeType: string;
	/** The request date as `YYYY-MM-DD`, the way the sync shape carries it. */
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly receivedByProfileId: string | null;
	readonly closedAt: Date | null;
	readonly closedByProfileId: string | null;
	readonly createdByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

const serviceRequestDisplayColumns: MapDisplayColumns<SafeServiceRequestDisplayRow> = {
	id: sql`sr.id`,
	organizationId: sql`sr.organization_id`,
	lat: sql`sr.lat`,
	lng: sql`sr.lng`,
	geojson: sql`sr.geojson`,
	geomType: sql`sr.geom_type`,
	displayName: sql`sr.display_name`,
	intakeType: sql`sr.intake_type`,
	// `to_char` rather than the bare `date`, which the driver would hand back as
	// a `Date` at midnight in the server's zone and move a day for half the world.
	requestDate: sql`to_char(sr.request_date, 'YYYY-MM-DD')`,
	details: sql`sr.details`,
	contactId: sql`sr.contact_id`,
	addressId: sql`sr.address_id`,
	receivedByProfileId: sql`sr.received_by_profile_id`,
	closedAt: sql`sr.closed_at`,
	closedByProfileId: sql`sr.closed_by_profile_id`,
	createdByProfileId: sql`sr.created_by_profile_id`,
	createdAt: sql`sr.created_at`,
	updatedAt: sql`sr.updated_at`,
};

/**
 * The service requests map surface: request points as a vector tile for the
 * explorer map, the extent that map frames on load and after a filter change,
 * the page of requests inside the viewport its rail lists, and the one request
 * its map card opens. Each tile feature carries its `id` and whether it is
 * open, so the map colours a point by status without a second round-trip.
 *
 * The explorer used to draw a GeoJSON overlay off the whole Organization's
 * requests out of the sync collection, 1,180 rows in the prod clone over three
 * years, and filter and page them in the browser (#963). All four reads share
 * one scope and one filter predicate now, the way the ten other paged
 * explorers' surfaces do.
 *
 * The layer is the argument rather than a literal, because it is the key this
 * surface is registered under in `map-surface-register.ts`.
 */
export function serviceRequestSurface(
	layer: MapTilesetLayer,
): MapRecordSurfaceReaders<ServiceRequestMapFilters, SafeServiceRequestDisplayRow> {
	return mapRecordSurface<ServiceRequestMapFilters, SafeServiceRequestDisplayRow>({
		layer,
		from: sql`service_requests sr`,
		alias: 'sr',
		geom: sql`sr.geom`,
		properties: [sql`sr.id`, sql`(sr.closed_at is null) as "isOpen"`],
		filterWhere: serviceRequestFilterWhere,
		display: {
			columns: serviceRequestDisplayColumns,
			// Newest first, which is the order the explorer always read in, and the
			// order `service_requests_organization_date_idx` holds.
			orderBy: sql`sr.request_date desc, sr.created_at desc, sr.id`,
		},
	});
}

function serviceRequestFilterWhere(
	filters: ServiceRequestMapFilters | undefined,
): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [];

	if (filters?.isOpen === true) {
		whereClauses.push(sql<boolean>`sr.closed_at is null`);
	} else if (filters?.isOpen === false) {
		whereClauses.push(sql<boolean>`sr.closed_at is not null`);
	}

	whereClauses.push(...dateWindowClauses(sql`sr.request_date`, filters ?? {}));

	whereClauses.push(
		...tagMembershipClauses({
			id: sql`sr.id`,
			entityType: 'service_request',
			tagIds: filters?.tagIds,
		}),
	);

	whereClauses.push(
		...regionMembershipClauses({
			geom: sql`sr.geom`,
			geomType: sql`sr.geom_type`,
			organizationId: sql`sr.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);

	// The title is `#<number>` on screen, so `#12` finds request twelve the way
	// typing it into the rail did; a request the server has not numbered yet has
	// no title to match and matches on its details alone.
	whereClauses.push(
		...searchClauses(filters?.search, [
			sql`coalesce('#' || sr.display_name::text, '')`,
			sql`sr.details`,
		]),
	);

	return whereClauses;
}
