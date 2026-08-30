import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { describe } from 'vitest';
import type { SimmerDatabase } from '../index.js';
import { buildMigrationSql, readUpMigrations, type UpMigration } from './migration-sql.js';

const { Pool } = pg;

const testDatabaseUrl =
	process.env.SIMMER_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? null;

/**
 * Every test in an integration suite applies the full migration set into a
 * throwaway schema, so setup dominates the clock and vitest's five-second
 * default would fail these on setup alone, leaking the schema it was mid-way
 * through building.
 *
 * The set now goes out as one query rather than twenty-six, which took a test
 * against Railway staging from 12.4s to 8.8s and costs about a second against
 * the CI service container. One constant serves both paths, so it is sized for
 * the remote one: five times the measured remote cost, so a developer on a
 * slower link is never failed on latency alone, and still tight enough that a
 * hung test is caught inside a minute rather than after three.
 */
const INTEGRATION_TIMEOUT_MS = 45_000;

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
	/**
	 * Apply the migrations `pauseBefore` held back, if any.
	 *
	 * Calling it a second time is a no-op, so a test that runs it in the middle
	 * and a harness that would otherwise leave the schema half-built cannot
	 * disagree. Without `pauseBefore` there is nothing held back and this does
	 * nothing.
	 */
	readonly applyHeldBackMigrations: () => Promise<void>;
}

export interface TestDbOptions {
	/**
	 * Stop applying the set before this migration file, so the test can seed rows
	 * that predate it and then run it.
	 *
	 * This is what makes a backfill testable. A migration that rewrites existing
	 * documents is correct for every row written after it whether or not the
	 * backfill works, so a test that seeds after the migration proves nothing
	 * about the rows already in production.
	 */
	readonly pauseBefore?: string;
}

export async function withTestDb<T>(
	run: (context: TestDbContext) => Promise<T>,
	options: TestDbOptions = {},
): Promise<T> {
	if (testDatabaseUrl === null) {
		throw new Error('SIMMER_TEST_DATABASE_URL or TEST_DATABASE_URL is required.');
	}

	const schemaName = `simmer_test_${process.pid}_${Date.now()}_${Math.random()
		.toString(16)
		.slice(2)}`;
	const { first, heldBack } = splitMigrations(await readUpMigrations(), options.pauseBefore);
	const setupPool = new Pool({ connectionString: testDatabaseUrl });
	let schemaCreated = false;
	let setupComplete = false;

	try {
		await refuseDatabaseWithReplicationSlot(setupPool);
		await sweepAbandonedSchemasOnce(setupPool);
		await setupPool.query(`create schema ${schemaName}`);
		schemaCreated = true;
		await applyMigrations(setupPool, schemaName, first);
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

	let pending = heldBack;
	const applyHeldBackMigrations = async () => {
		if (pending.length === 0) {
			return;
		}
		// A pool of its own: the Kysely pool sends every statement through the
		// extended protocol, which refuses a multi-statement query.
		const pool = new Pool({ connectionString: testDatabaseUrl });
		try {
			await applyMigrations(pool, schemaName, pending);
			pending = [];
		} finally {
			await pool.end();
		}
	};

	try {
		return await run({ db, schemaName, applyHeldBackMigrations });
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
 * A pool the replication-slot check can read `pg_replication_slots` through.
 *
 * Narrower than `pg.Pool` so a test can hand it a fake and drive the refusal
 * without a database.
 */
export interface SlotReadable {
	query(sql: string): Promise<{ readonly rows: readonly { readonly slot_name: string }[] }>;
}

/**
 * Refuse to run against a database anything replicates from.
 *
 * The migration set goes out as one query, so Postgres runs it as one implicit
 * transaction creating 326 relations. A logical decoder has to reassemble that
 * transaction in its reorder buffer, which overruns Postgres's hard 1 GB limit
 * and kills the walsender. It then dies the same way on every reconnect, for
 * good. That is how staging's Electric sync died in #236, and the instruction
 * that pointed these suites at staging was in `CLAUDE.md` at the time.
 *
 * There is deliberately no override. An escape hatch gets copied into somebody's
 * script and becomes the documented workflow again, which is how this happened
 * the first time.
 */
export async function refuseDatabaseWithReplicationSlot(pool: SlotReadable): Promise<void> {
	const { rows } = await pool.query('select slot_name from pg_replication_slots');
	if (rows.length === 0) {
		return;
	}

	const slots = rows.map((row) => row.slot_name).join(', ');
	throw new Error(
		`Refusing to run integration tests against a database with a replication slot (${slots}). ` +
			'The migration set applies as one transaction of 326 relations, which overruns the ' +
			"logical decoder's 1 GB reorder buffer and kills the walsender for good. Start the " +
			'local Postgres from docker-compose.yml and point TEST_DATABASE_URL at that instead.',
	);
}

/**
 * How long a test schema may live before it counts as abandoned.
 *
 * Comfortably longer than the slowest suite, so a run in progress on another
 * machine is never mistaken for litter.
 */
const ABANDONED_SCHEMA_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * The sweep is worth doing once a run, not once a test.
 *
 * Litter accumulates between runs, never during one, so re-checking before each
 * of eighteen tests only buys eighteen round-trips to a remote database. The
 * promise is cached rather than a boolean so tests that start concurrently wait
 * on the same sweep instead of racing it.
 */
let abandonedSchemaSweep: Promise<void> | null = null;

/**
 * A database that dies with the run cannot accumulate litter.
 *
 * CI runs against a service container that is destroyed with the job, so the
 * sweep there is a round-trip that can never find anything. Every other path —
 * a laptop pointed at Railway staging, a local container a developer keeps —
 * outlives its runs and still needs it.
 */
const databaseIsEphemeral = process.env.SIMMER_TEST_DATABASE_EPHEMERAL === 'true';

function sweepAbandonedSchemasOnce(pool: InstanceType<typeof Pool>): Promise<void> {
	if (databaseIsEphemeral) {
		return Promise.resolve();
	}

	// Each caller brings its own pool and closes it afterwards, so a cached
	// rejection would strand every later test on a connection that no longer
	// exists. Clear it on failure and let the next test retry with a live pool.
	abandonedSchemaSweep ??= dropAbandonedSchemas(pool).catch((error: unknown) => {
		abandonedSchemaSweep = null;
		throw error;
	});
	return abandonedSchemaSweep;
}

/**
 * Sweep schemas left behind by killed runs.
 *
 * `withTestDb` drops its schema in a `finally`, which covers a failing test but
 * not the process being killed — a Ctrl-C, a timeout that takes the worker with
 * it. On a database that outlives its runs, that litter accumulates where
 * everyone can see it.
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

/**
 * Split the ordered set at `pauseBefore`.
 *
 * The name has to match a file, or a renamed migration would silently turn a
 * staged test into an ordinary one that still passes.
 */
function splitMigrations(
	migrations: readonly UpMigration[],
	pauseBefore: string | undefined,
): { readonly first: readonly UpMigration[]; readonly heldBack: readonly UpMigration[] } {
	if (pauseBefore === undefined) {
		return { first: migrations, heldBack: [] };
	}

	const index = migrations.findIndex((migration) => migration.name === pauseBefore);
	if (index === -1) {
		throw new Error(`No migration named ${pauseBefore}. Has the file been renamed?`);
	}

	return { first: migrations.slice(0, index), heldBack: migrations.slice(index) };
}

/**
 * Apply a run of migrations to the throwaway schema in one round-trip.
 *
 * Twenty-six separate queries per test was the single largest cost in these
 * suites: forty-seven harness entries times twenty-six migrations is thirteen
 * hundred sequential round-trips a run, each of them paying the connection's
 * latency whatever it is. A multi-statement simple query pays it once.
 *
 * The set is read from disk on every entry rather than cached: the read is
 * local and cheap beside the query, and caching would hide a migration added
 * mid-run behind a stale copy.
 */
async function applyMigrations(
	pool: InstanceType<typeof Pool>,
	schemaName: string,
	migrations: readonly UpMigration[],
): Promise<void> {
	try {
		await pool.query(buildMigrationSql(migrations, schemaName));
	} catch (error) {
		throw await attributeMigrationFailure(pool, schemaName, migrations, error);
	}
}

/**
 * Work out which migration a failed set failed on.
 *
 * One query for twenty-six migrations means Postgres reports one error with no
 * file attached to it, which is not a debuggable failure. The set ran in an
 * implicit transaction, so the failure rolled the whole thing back and left the
 * schema empty — replaying the migrations one at a time reaches the same
 * statement and names the file it came from.
 *
 * The replay is only ever paid on the way to a failure.
 */
async function attributeMigrationFailure(
	pool: InstanceType<typeof Pool>,
	schemaName: string,
	migrations: readonly UpMigration[],
	original: unknown,
): Promise<Error> {
	const client = await pool.connect();
	try {
		await client.query(`set search_path to ${schemaName}, public`);
		for (const migration of migrations) {
			try {
				await client.query(migration.sql);
			} catch (error) {
				return new Error(`Migration ${migration.name} failed to apply: ${messageOf(error)}`, {
					cause: error,
				});
			}
		}
	} catch (replayError) {
		return new Error(
			`The migration set failed to apply and the replay that would name the migration ` +
				`failed too: ${messageOf(replayError)}. Original failure: ${messageOf(original)}`,
			{ cause: original },
		);
	} finally {
		client.release();
	}

	// The set failed but every migration applied on its own — the failure is in
	// how they combine, so the original error is the only truthful report.
	return new Error(
		`The migration set failed to apply, but every migration applied individually on ` +
			`replay: ${messageOf(original)}`,
		{ cause: original },
	);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
