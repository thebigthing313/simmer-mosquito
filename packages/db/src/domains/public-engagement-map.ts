import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sql } from 'kysely';
import type { DbExecutor } from '../index.js';
import type { MapByIdInput } from './map-surface.js';

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
export type NotificationRegistrationByIdInput = MapByIdInput;

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
	input: NotificationRegistrationByIdInput,
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
