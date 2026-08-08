import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { GeoJsonGeometry, SimmerDatabase } from './tables.js';

const { Pool } = pg;

export type { Kysely, RawBuilder, Transaction } from 'kysely';
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
export * from './domains/org-owned-writes.js';
export * from './domains/record-deletion.js';
export * from './domains/service-request-nearby.js';
export * from './tables.js';

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
