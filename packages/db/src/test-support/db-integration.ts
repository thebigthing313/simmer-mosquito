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

export function describeDbIntegration(name: string, suite: () => void): void {
	if (testDatabaseUrl === null) {
		describe.skip(name, suite);
		return;
	}

	describe(name, suite);
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
