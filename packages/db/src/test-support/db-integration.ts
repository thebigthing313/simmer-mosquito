import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe } from 'vitest';
import type { SimmerDatabase } from '../index.js';
import { buildMigrationSql, readUpMigrations, type UpMigration } from './migration-sql.js';

const { Client, Pool } = pg;

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

/**
 * The abort signal of the test running inside a `describeDbIntegration` suite.
 *
 * vitest hands every test a signal on its context and aborts it when the test
 * times out or the run is cancelled. `withTestDb` is called from 282 sites and
 * none of them passes the context through, so the suite wrapper records the
 * signal in a `beforeEach` and the harness reads it here. Tests in one file run
 * one at a time, which is what makes one module-level slot enough; a
 * `describe.concurrent` suite would race it, and none of the integration suites
 * is concurrent.
 */
let runningTestSignal: AbortSignal | null = null;

/**
 * Every `withTestDb` that has not finished cleaning up.
 *
 * A test that timed out has been given up on, but its harness is still
 * cancelling backends and dropping its schema, and a file whose last test that
 * was is over as soon as the report is written. vitest then recycles the
 * worker, and a drop still on the wire dies with it, which is the litter the
 * sweep exists for. So the hooks below wait for the set to empty before the
 * next test starts and before the file ends. For a test that awaited its
 * harness the set is already empty and the wait costs nothing.
 */
const pendingHarnesses = new Set<Promise<void>>();

/**
 * How long a hook waits for an aborted harness to finish cleaning up.
 *
 * The cleanup is itself bounded, a pool drain and a drop at
 * `TEARDOWN_TIMEOUT_MS` each, so this is that twice over with room for the
 * cancel round-trip in front of it.
 */
const PENDING_HARNESS_WAIT_MS = 30_000;

export function describeDbIntegration(name: string, suite: () => void): void {
	if (testDatabaseUrl === null) {
		describe.skip(name, suite);
		return;
	}

	describe(name, { timeout: INTEGRATION_TIMEOUT_MS }, () => {
		beforeEach(({ signal }) => {
			runningTestSignal = signal;
		});
		afterEach(async () => {
			runningTestSignal = null;
			await Promise.all(pendingHarnesses);
		}, PENDING_HARNESS_WAIT_MS);
		afterAll(async () => {
			await Promise.all(pendingHarnesses);
		}, PENDING_HARNESS_WAIT_MS);
		suite();
	});
}

/**
 * The signal `withTestDb` reads when a caller passes none, for the suite that
 * proves the `beforeEach` above records the right one.
 */
export function runningTestAbortSignal(): AbortSignal | null {
	return runningTestSignal;
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
	/**
	 * Abort the harness from outside: cancel every backend it opened, drop the
	 * schema and reject with `TestDbAbortedError`.
	 *
	 * Defaults to the running test's own signal inside `describeDbIntegration`,
	 * which vitest aborts when the test times out, so a caller passes one only
	 * to abort on a condition of its own.
	 */
	readonly signal?: AbortSignal;
}

/**
 * What `withTestDb` rejects with once its signal has aborted.
 *
 * The query the cancel interrupted throws `57014 query_canceled`, and a test
 * that timed out should read as a timeout rather than as a cancelled query, so
 * the message carries the signal's reason and the interrupted failure rides
 * along as `cause`.
 */
export class TestDbAbortedError extends Error {
	constructor(schemaName: string, phase: string, reason: unknown, cause: unknown) {
		super(`withTestDb was aborted while ${phase} (${schemaName}): ${messageOf(reason)}`, {
			cause,
		});
		this.name = 'TestDbAbortedError';
	}
}

export function withTestDb<T>(
	run: (context: TestDbContext) => Promise<T>,
	options: TestDbOptions = {},
): Promise<T> {
	const harness = runHarness(run, options);
	const settled = harness.then(
		() => undefined,
		() => undefined,
	);
	pendingHarnesses.add(settled);
	void settled.then(() => pendingHarnesses.delete(settled));
	return harness;
}

async function runHarness<T>(
	run: (context: TestDbContext) => Promise<T>,
	options: TestDbOptions,
): Promise<T> {
	if (testDatabaseUrl === null) {
		throw new Error('SIMMER_TEST_DATABASE_URL or TEST_DATABASE_URL is required.');
	}

	refuseLoopbackNameOnWindows(testDatabaseUrl);

	const signal = options.signal ?? runningTestSignal;
	const schemaName = `simmer_test_${process.pid}_${Date.now()}_${Math.random()
		.toString(16)
		.slice(2)}`;
	if (signal?.aborted) {
		throw new TestDbAbortedError(schemaName, 'starting', signal.reason, signal.reason);
	}

	const backends = new HarnessBackends(testDatabaseUrl, schemaName);
	const cancelBackends = () => {
		void backends.cancelAll();
	};
	signal?.addEventListener('abort', cancelBackends, { once: true });

	try {
		const { first, heldBack } = splitMigrations(await readUpMigrations(), options.pauseBefore);
		await buildSchema(backends, schemaName, first, signal);

		const db = new Kysely<SimmerDatabase>({
			dialect: new PostgresDialect({
				pool: backends.pool({ options: `-c search_path=${schemaName},public` }),
			}),
		});

		let pending = heldBack;
		const applyHeldBackMigrations = async () => {
			if (pending.length === 0) {
				return;
			}
			// A pool of its own: the Kysely pool sends every statement through the
			// extended protocol, which refuses a multi-statement query.
			const pool = backends.pool();
			try {
				await applyMigrations(pool, schemaName, pending, signal);
				pending = [];
			} finally {
				await pool.end();
			}
		};

		try {
			return await settleOrAbort(run({ db, schemaName, applyHeldBackMigrations }), signal);
		} catch (error) {
			throw abortedOr(error, signal, schemaName, 'running the test');
		} finally {
			await tearDown(db, backends.url, schemaName, signal);
		}
	} finally {
		signal?.removeEventListener('abort', cancelBackends);
	}
}

/**
 * Create the schema and apply the migration set into it.
 *
 * A build the signal interrupts is dropped here rather than left for the
 * teardown, because the teardown is only reached once the schema exists. The
 * drop is bounded and reported rather than awaited without limit, so an abort
 * that cannot clean up still surfaces as the abort.
 */
async function buildSchema(
	backends: HarnessBackends,
	schemaName: string,
	migrations: readonly UpMigration[],
	signal: AbortSignal | null,
): Promise<void> {
	const setupPool = backends.pool();
	let schemaCreated = false;
	let setupComplete = false;

	try {
		await refuseDatabaseWithReplicationSlot(setupPool);
		await sweepAbandonedSchemasOnce(setupPool);
		await setupPool.query(`create schema ${schemaName}`);
		schemaCreated = true;
		await applyMigrations(setupPool, schemaName, migrations, signal);
		setupComplete = true;
	} catch (error) {
		throw abortedOr(error, signal, schemaName, 'building its schema');
	} finally {
		await endWithin(setupPool, schemaName);
		if (schemaCreated && !setupComplete) {
			await dropSchemaOrWarn(backends.url, schemaName);
		}
	}
}

/**
 * Close the test's pool and drop its schema, whichever way the test ended.
 *
 * After an abort the test body may still be running, in which case the pool
 * cannot drain and the drop may find the schema locked. Both are bounded, and
 * on the abort path a drop that fails is a warning naming the schema rather
 * than a second error over the abort: the sweep collects it on a later run.
 */
async function tearDown(
	db: Kysely<SimmerDatabase>,
	url: string,
	schemaName: string,
	signal: AbortSignal | null,
): Promise<void> {
	if (!(await settlesWithin(db.destroy(), TEARDOWN_TIMEOUT_MS))) {
		warn(
			`the pool for ${schemaName} did not close within ${TEARDOWN_TIMEOUT_MS}ms; ` +
				'a connection the test checked out is still busy.',
		);
	}
	if (signal?.aborted) {
		await dropSchemaOrWarn(url, schemaName);
		return;
	}
	await dropSchema(url, schemaName);
}

/** How long the harness waits for a pool to drain or a schema to drop. */
const TEARDOWN_TIMEOUT_MS = 10_000;

/**
 * Drop a test schema from a connection of its own, bounded on both sides.
 *
 * `statement_timeout` covers the drop waiting on a lock a cancelled backend has
 * not yet released, and `query_timeout` is the client-side clock for a
 * connection that stops answering; either way the promise settles inside the
 * bound rather than holding the worker.
 */
async function dropSchema(url: string, schemaName: string): Promise<void> {
	const client = new Client({
		connectionString: url,
		connectionTimeoutMillis: TEARDOWN_TIMEOUT_MS,
		statement_timeout: TEARDOWN_TIMEOUT_MS,
		query_timeout: TEARDOWN_TIMEOUT_MS + 1_000,
	});
	await client.connect();
	try {
		await client.query(`drop schema if exists ${schemaName} cascade`);
	} finally {
		await client.end();
	}
}

async function dropSchemaOrWarn(url: string, schemaName: string): Promise<void> {
	try {
		await dropSchema(url, schemaName);
	} catch (error) {
		warn(
			`could not drop ${schemaName}: ${messageOf(error)}. ` +
				'The abandoned-schema sweep collects it on a later run.',
		);
	}
}

async function endWithin(pool: InstanceType<typeof Pool>, schemaName: string): Promise<void> {
	if (!(await settlesWithin(pool.end(), TEARDOWN_TIMEOUT_MS))) {
		warn(`the setup pool for ${schemaName} did not close within ${TEARDOWN_TIMEOUT_MS}ms.`);
	}
}

/** Whether `work` settles inside `ms`. A rejection counts as settled. */
function settlesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), ms);
		timer.unref();
		work
			.then(
				() => resolve(true),
				() => resolve(true),
			)
			.finally(() => clearTimeout(timer));
	});
}

/**
 * Settle with `work`, or reject with the signal's reason the moment it aborts.
 *
 * The test body cannot be stopped, so after an abort it may go on running
 * against a pool the teardown is closing. Its later rejection lands on a
 * promise that has already settled and goes nowhere, which is the shape
 * vitest's own timeout wrapper relies on.
 */
function settleOrAbort<T>(work: Promise<T>, signal: AbortSignal | null): Promise<T> {
	if (signal === null) {
		return work;
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}

function abortedOr(
	error: unknown,
	signal: AbortSignal | null,
	schemaName: string,
	phase: string,
): unknown {
	if (signal?.aborted) {
		return new TestDbAbortedError(schemaName, phase, signal.reason, error);
	}
	return error;
}

function warn(message: string): void {
	process.stderr.write(`withTestDb: ${message}\n`);
}

/**
 * The pools one `withTestDb` opens, and the pid of every backend behind them.
 *
 * A backend's pid is read off the client as its connection joins a pool: pg
 * keeps it as `processID` from the BackendKeyData message the server sends
 * during startup, and it is the number pg's own `Client.cancel` puts in a
 * CancelRequest, the same one `select pg_backend_pid()` would answer. Reading
 * it costs no query, and a query would be one queued ahead of the caller's
 * first statement, which pg 8.20 deprecates and pg 9 removes. Once the signal
 * has aborted, a backend that connects later is cancelled as it arrives, which
 * closes the gap between the abort and a connect that was in flight when it
 * fired.
 *
 * Cancelling goes through a second connection, because `pg_cancel_backend`
 * has to reach a backend that is busy running the statement being cancelled.
 * Cancel and not terminate: a cancel interrupts the statement and leaves the
 * connection usable, so the teardown can close the pool in order, while a
 * terminate would fire the pool's `error` event on every idle client.
 */
class HarnessBackends {
	private readonly pids: number[] = [];
	private aborted = false;

	constructor(
		readonly url: string,
		private readonly schemaName: string,
	) {}

	/**
	 * A pool whose backends are on record, carrying the schema name as
	 * `application_name` so `pg_stat_activity` says which test each one is.
	 */
	pool(config: Omit<pg.PoolConfig, 'connectionString'> = {}): InstanceType<typeof Pool> {
		const pool = new Pool({
			...config,
			connectionString: this.url,
			application_name: this.schemaName,
		});
		pool.on('connect', (client) => {
			const pid = backendPid(client);
			if (pid === null) {
				warn(
					`a connection for ${this.schemaName} carries no backend pid, so it cannot be cancelled.`,
				);
				return;
			}
			this.pids.push(pid);
			if (this.aborted) {
				void this.cancel([pid]);
			}
		});
		return pool;
	}

	cancelAll(): Promise<void> {
		this.aborted = true;
		return this.cancel([...this.pids]);
	}

	private async cancel(ids: readonly number[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}

		const client = new Client({
			connectionString: this.url,
			connectionTimeoutMillis: TEARDOWN_TIMEOUT_MS,
			query_timeout: TEARDOWN_TIMEOUT_MS,
		});
		try {
			await client.connect();
			await client.query('select pg_cancel_backend(pid) from unnest($1::int[]) as pid', [ids]);
		} catch (error) {
			warn(
				`could not cancel backends ${ids.join(', ')} for ${this.schemaName}: ${messageOf(error)}`,
			);
		} finally {
			await client.end().catch(() => undefined);
		}
	}
}

/**
 * `processID` is set on every connected pg client and is not in `@types/pg`,
 * so it is read through a structural type rather than a cast to `any`.
 */
function backendPid(client: pg.PoolClient): number | null {
	const { processID } = client as { readonly processID?: unknown };
	return typeof processID === 'number' ? processID : null;
}

/**
 * The host names that mean IPv6 loopback to Node on Windows.
 *
 * `localhost` resolves to `::1` ahead of `127.0.0.1` on Node 17 and later, and
 * `[::1]` says so outright.
 */
const IPV6_LOOPBACK_NAMES: ReadonlySet<string> = new Set(['localhost', '[::1]']);

/**
 * Refuse a URL that reaches a container through IPv6 loopback on Windows.
 *
 * Docker Desktop publishes a port on `0.0.0.0` and on `[::]`, and a connection
 * to either goes through its own proxy rather than to the container. Under the
 * burst of connects a full `pnpm test` opens, eleven workers each starting a
 * pool at once, the `::1` listener accepts the TCP connection and then never
 * completes the backend half: the client sits with no answer and the proxy
 * resets it at exactly thirty seconds. The IPv4 listener does not do this. It
 * was measured with an independent client opening five connections a second
 * beside `packages/db` at eleven workers on a fresh container: over `localhost`,
 * 60 of 450 connects hung and were reset at 30,000ms while the rest took 12ms;
 * over `127.0.0.1`, 450 of 450 connected and the suite passed 311 of 311. The
 * suite alone showed the same two faces #926 was filed with, a test timing out
 * at 45s and `read ECONNRESET` on a file that passes alone, and both were one
 * hung connect. Neither a worker cap nor serialising the two projects in Nx
 * moved it, because the burst is the start of a run and not its width.
 *
 * Windows only, because that is where the proxy is. CI's service container is
 * reached over `localhost` on Linux and needs nothing. There is deliberately no
 * override, for the reason `refuseDatabaseWithReplicationSlot` gives: the URL
 * is the fix and the message carries it.
 */
export function refuseLoopbackNameOnWindows(
	url: string,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform !== 'win32') {
		return;
	}

	const parsed = new URL(url);
	const name = parsed.hostname;
	if (!IPV6_LOOPBACK_NAMES.has(name)) {
		return;
	}

	parsed.hostname = '127.0.0.1';
	throw new Error(
		[
			`Refusing to run integration tests over ${name} on Windows. ` +
				"That name is IPv6 loopback, and Docker Desktop's IPv6 port proxy " +
				'hangs new connections under the burst a full pnpm test opens, which arrives as ' +
				'a 45s timeout or read ECONNRESET on a file that passes alone (#926).',
			`Point TEST_DATABASE_URL at the container over IPv4 instead: ${parsed.href}`,
		].join('\n'),
	);
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
 *
 * So the message has to carry the way out instead. `docker-compose.yml` runs
 * Electric against its own `postgres` service, so anyone who has started the
 * local Electric has `electric_slot_default` in the container these suites are
 * told to use, and
 * a refusal that only said "use the local container" would be a closed loop.
 * Dropping the slot is safe on that container and nowhere else, so the message
 * says which database it is talking about before it says what to run.
 */
export async function refuseDatabaseWithReplicationSlot(pool: SlotReadable): Promise<void> {
	const { rows } = await pool.query('select slot_name from pg_replication_slots');
	if (rows.length === 0) {
		return;
	}

	const slots = rows.map((row) => row.slot_name);
	const drops = slots.map((slot) => `select pg_drop_replication_slot('${slot}');`).join(' ');
	throw new Error(
		[
			'Refusing to run integration tests against a database with a replication slot ' +
				`(${slots.join(', ')}). The migration set applies as one transaction of 326 ` +
				"relations, which overruns the logical decoder's 1 GB reorder buffer and kills " +
				'the walsender for good.',
			'If this is your own container from docker-compose.yml, the slot is the local ' +
				`Electric's. Drop it on that container and run again: ${drops} A local Electric ` +
				'recreates its slot on next boot, so it costs one re-snapshot and nothing else.',
			'If this is a remote database, staging included, leave the slot alone and point ' +
				'TEST_DATABASE_URL at the local container instead.',
		].join('\n'),
	);
}

/**
 * How long a test schema may live before it counts as abandoned.
 *
 * A schema belongs to one test, and no test outlives its file: the 45s bound
 * above ends the wait, the abort that follows it cancels the work, and the
 * watchdog in `vitest.shared.ts` kills a file that has held a worker for eight
 * minutes. Thirty minutes is nearly four times that, so a run in progress on
 * another machine is never mistaken for litter, and an orphan a failed drop
 * reported is collected by the next run after that rather than by the one two
 * hours later.
 */
const ABANDONED_SCHEMA_AGE_MS = 30 * 60 * 1000;

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
 * sweep there is a round-trip that can never find anything. Every other path,
 * a laptop pointed at Railway staging or a local container a developer keeps,
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
 * `withTestDb` drops its schema in a `finally`, which covers a failing test and
 * an aborted one but not the process being killed: a Ctrl-C, or the watchdog
 * taking the worker with it. On a database that outlives its runs, that litter
 * accumulates where everyone can see it.
 *
 * The name carries the creation time, so age is readable without a catalog
 * column. Only schemas older than the cutoff go, which keeps concurrent runs,
 * two PRs or a laptop and a CI job, from dropping each other's work.
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
 *
 * A set the signal cancelled is not replayed to find the failing migration,
 * because there is none: the replay would apply twenty-six migrations one at a
 * time for a test nobody is waiting on.
 */
async function applyMigrations(
	pool: InstanceType<typeof Pool>,
	schemaName: string,
	migrations: readonly UpMigration[],
	signal: AbortSignal | null,
): Promise<void> {
	try {
		await pool.query(buildMigrationSql(migrations, schemaName));
	} catch (error) {
		if (signal?.aborted) {
			throw error;
		}
		throw await attributeMigrationFailure(pool, schemaName, migrations, error);
	}
}

/**
 * Work out which migration a failed set failed on.
 *
 * One query for twenty-six migrations means Postgres reports one error with no
 * file attached to it, which is not a debuggable failure. The set ran in an
 * implicit transaction, so the failure rolled the whole thing back and left the
 * schema empty, and replaying the migrations one at a time reaches the same
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

	// The set failed but every migration applied on its own, so the failure is
	// in how they combine and the original error is the only truthful report.
	return new Error(
		`The migration set failed to apply, but every migration applied individually on ` +
			`replay: ${messageOf(original)}`,
		{ cause: original },
	);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
