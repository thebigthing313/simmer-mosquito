import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { describe } from 'vitest';
import type { SimmerDatabase } from '../index.js';

const { Pool } = pg;

const testDatabaseUrl =
	process.env.SIMMER_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? null;

/**
 * Every test in an integration suite applies the full migration set into a
 * throwaway schema, and the test database is remote — a Railway environment
 * rather than a container on the loopback. That is roughly ten seconds per
 * test, so the suite carries its own timeout; vitest's five-second default
 * fails these on latency alone and leaks the schema it was mid-way through
 * building.
 */
const INTEGRATION_TIMEOUT_MS = 180_000;

export function describeDbIntegration(name: string, suite: () => void): void {
	if (testDatabaseUrl === null) {
		describe.skip(name, suite);
		return;
	}

	describe(name, { timeout: INTEGRATION_TIMEOUT_MS }, suite);
}

export interface TestDbContext {
	readonly db: Kysely<SimmerDatabase>;
	readonly schemaName: string;
}

export async function withTestDb<T>(run: (context: TestDbContext) => Promise<T>): Promise<T> {
	if (testDatabaseUrl === null) {
		throw new Error('SIMMER_TEST_DATABASE_URL or TEST_DATABASE_URL is required.');
	}

	const schemaName = `simmer_test_${process.pid}_${Date.now()}_${Math.random()
		.toString(16)
		.slice(2)}`;
	const setupPool = new Pool({ connectionString: testDatabaseUrl });
	let schemaCreated = false;
	let setupComplete = false;

	try {
		await dropAbandonedSchemas(setupPool);
		await setupPool.query(`create schema ${schemaName}`);
		schemaCreated = true;
		await setupPool.query(`set search_path to ${schemaName}, public`);

		for (const migration of await readUpMigrations()) {
			await setupPool.query(migration);
		}
		setupComplete = true;
	} finally {
		if (schemaCreated && !setupComplete) {
			await setupPool.query(`drop schema if exists ${schemaName} cascade`);
		}
		await setupPool.end();
	}

	const db = new Kysely<SimmerDatabase>({
		dialect: new PostgresDialect({
			pool: new Pool({
				connectionString: testDatabaseUrl,
				options: `-c search_path=${schemaName},public`,
			}),
		}),
	});

	try {
		return await run({ db, schemaName });
	} finally {
		await db.destroy();
		const teardownPool = new Pool({ connectionString: testDatabaseUrl });
		try {
			await teardownPool.query(`drop schema ${schemaName} cascade`);
		} finally {
			await teardownPool.end();
		}
	}
}

/**
 * How long a test schema may live before it counts as abandoned.
 *
 * Comfortably longer than the slowest suite, so a run in progress on another
 * machine is never mistaken for litter.
 */
const ABANDONED_SCHEMA_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Sweep schemas left behind by killed runs.
 *
 * `withTestDb` drops its schema in a `finally`, which covers a failing test but
 * not the process being killed — a cancelled CI job, a Ctrl-C, a timeout that
 * takes the worker with it. The database is shared now, so that litter
 * accumulates where everyone can see it.
 *
 * The name carries the creation time, so age is readable without a catalog
 * column. Only schemas older than the cutoff go, which keeps concurrent runs —
 * two PRs, or a laptop and a CI job — from dropping each other's work.
 */
async function dropAbandonedSchemas(pool: InstanceType<typeof Pool>): Promise<void> {
	const { rows } = await pool.query<{ readonly nspname: string }>(
		"select nspname from pg_namespace where nspname like 'simmer\\_test\\_%'",
	);

	const cutoff = Date.now() - ABANDONED_SCHEMA_AGE_MS;
	for (const { nspname } of rows) {
		const createdAt = Number.parseInt(nspname.split('_')[3] ?? '', 10);
		if (Number.isNaN(createdAt) || createdAt >= cutoff) {
			continue;
		}
		await pool.query(`drop schema if exists ${nspname} cascade`);
	}
}

async function readUpMigrations(): Promise<string[]> {
	const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
	const migrationFiles = (await readdir(migrationsDir))
		.filter((file) => file.endsWith('.sql'))
		.sort((left, right) => left.localeCompare(right));

	return Promise.all(
		migrationFiles.map(async (file) => {
			const migration = await readFile(join(migrationsDir, file), 'utf8');
			const up = migration.match(/-- migrate:up\s*([\s\S]*?)\s*-- migrate:down/);
			if (up?.[1] === undefined) {
				throw new Error(`Migration ${file} is missing migrate:up or migrate:down markers.`);
			}

			return up[1].trim();
		}),
	);
}
