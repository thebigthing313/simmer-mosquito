import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';

import type { GeoJsonGeometry, SimmerDatabase } from './tables.js';

const { Pool } = pg;

export type { Kysely, RawBuilder, SelectType, Transaction } from 'kysely';
export { sql } from 'kysely';
export * from './domains/adult-surveillance.js';
export * from './domains/control-operations-map.js';
export * from './domains/foundation.js';
export * from './domains/habitats.js';
export * from './domains/identity.js';
export * from './domains/larval-surveillance.js';
export * from './domains/map-extent.js';
export * from './domains/map-region-filter.js';
export * from './domains/map-tile.js';
export * from './domains/mission-dispatch-map.js';
export * from './domains/mission-notification-generation.js';
export * from './domains/org-owned-writes.js';
export * from './domains/profile-activity.js';
export * from './domains/public-engagement-map.js';
export * from './domains/record-deletion.js';
export * from './domains/record-duplicates.js';
export * from './domains/record-history.js';
export * from './domains/record-merge.js';
export * from './domains/region-membership.js';
export * from './domains/search.js';
export * from './domains/service-request-nearby.js';
export * from './domains/write-references.js';
export * from './tables.js';

/**
 * Anything that can run a query: the pool-backed instance or a transaction on it.
 *
 * Every reader and writer in `domains/` and `seeds/` takes one of these so the
 * same function works inside a server-authorized transaction and standalone.
 * It was declared identically in eight modules before living here, which made it
 * a private type in each of their exported signatures, so callers could pass one
 * but could not name it.
 *
 * It sits here rather than in `tables.ts` because that file is generated.
 */
export type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

export interface CreateDbOptions {
	readonly databaseUrl: string;
	readonly maxConnections?: number;
}

export function createDb(options: CreateDbOptions): Kysely<SimmerDatabase> {
	return new Kysely<SimmerDatabase>({
		dialect: new PostgresDialect({
			pool: new Pool({
				connectionString: options.databaseUrl,
				max: options.maxConnections ?? 10,
			}),
		}),
	});
}

export interface OwnedGeometryInfo {
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
}

export interface MutationWriteResult<TRow> {
	readonly row: TRow;
	readonly txid: number;
}
