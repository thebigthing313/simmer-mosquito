import pg from 'pg';
import { expect, it } from 'vitest';
import { sql } from '../../../index.js';
import {
	describeDbIntegration,
	runningTestAbortSignal,
	TestDbAbortedError,
	withTestDb,
} from '../../../test-support/db-integration.js';

const { Client } = pg;

/**
 * The harness reads the URL for itself. The observer here needs its own
 * connection, because the question is what the database holds once the
 * harness has let go, and that cannot be asked through the pool being closed.
 */
const observerUrl = process.env.SIMMER_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '';

/** Long enough that a wait of this length is a hang and not a slow container. */
const HUNG_QUERY_SECONDS = 60;

/** How long the observer polls before calling a backend or a schema still there. */
const OBSERVE_TIMEOUT_MS = 10_000;

describeDbIntegration('withTestDb abort handling', () => {
	it('reads the running test signal when the caller passes none', ({ signal }) => {
		expect(runningTestAbortSignal()).toBe(signal);
	});

	it('cancels a running query, drops the schema and names the abort', async () => {
		const controller = new AbortController();
		let schema = '';
		const started = Date.now();

		const failure = await withTestDb(
			async ({ db, schemaName }) => {
				schema = schemaName;
				setTimeout(() => controller.abort(new Error('the probe gave up')), 250);
				await sql`select pg_sleep(${HUNG_QUERY_SECONDS})`.execute(db);
			},
			{ signal: controller.signal },
		).then(
			() => null,
			(error: unknown) => error,
		);

		expect(failure).toBeInstanceOf(TestDbAbortedError);
		expect((failure as Error).message).toContain('the probe gave up');
		expect((failure as Error).message).toContain('running the test');
		expect(Date.now() - started).toBeLessThan(OBSERVE_TIMEOUT_MS);

		await withObserver(async (observer) => {
			expect(
				await pollUntil(
					() => backendsFor(observer, schema),
					(n) => n === 0,
				),
			).toBe(0);
			expect(
				await pollUntil(
					() => schemaExists(observer, schema),
					(exists) => !exists,
				),
			).toBe(false);
		});
	});

	it('a build abandoned mid-migration leaves no schema behind', async () => {
		const controller = new AbortController();
		let bodyRan = false;

		await withObserver(async (observer) => {
			const abortOnceBuilding = (async () => {
				const schema = await pollUntil(
					() => activeMigrationBuild(observer),
					(value) => value !== null,
				);
				controller.abort(new Error('the build was abandoned'));
				return schema;
			})();

			const failure = await withTestDb(
				async () => {
					bodyRan = true;
				},
				{ signal: controller.signal },
			).then(
				() => null,
				(error: unknown) => error,
			);
			const schema = await abortOnceBuilding;

			expect(schema, 'the observer never saw the migration set running').not.toBeNull();
			expect(bodyRan).toBe(false);
			expect(failure).toBeInstanceOf(TestDbAbortedError);
			expect((failure as Error).message).toContain('building its schema');
			expect(
				await pollUntil(
					() => schemaExists(observer, schema ?? ''),
					(exists) => !exists,
				),
			).toBe(false);
		});
	});

	it('refuses to start once the signal has already aborted', async () => {
		const controller = new AbortController();
		controller.abort(new Error('aborted before the call'));
		let bodyRan = false;

		await expect(
			withTestDb(
				async () => {
					bodyRan = true;
				},
				{ signal: controller.signal },
			),
		).rejects.toThrow(/aborted before the call/);
		expect(bodyRan).toBe(false);
	});

	/**
	 * The full route, with nothing passed: vitest aborts the context signal on
	 * the timeout, `describeDbIntegration`'s `beforeEach` has recorded it, and
	 * `withTestDb` cancels whatever it was running, closes its pools and drops
	 * the schema while the next case is already running. `it.fails` turns the
	 * timeout into a pass, and the case after it asserts what was left behind.
	 *
	 * Which phase the abort lands in depends on the container: alone, the build
	 * is done inside the bound and the sleep is what gets cancelled; under four
	 * workers the build itself overruns it. The case after this one asks about
	 * every schema and backend this process opened, so it holds either way.
	 */
	it.fails('times out with the harness still busy', { timeout: 1_500 }, async () => {
		await withTestDb(async ({ db }) => {
			await sql`select pg_sleep(${HUNG_QUERY_SECONDS})`.execute(db);
		});
	});

	it('and the timed-out test has let go of its schema and its backends', async () => {
		await withObserver(async (observer) => {
			expect(
				await pollUntil(
					() => backendsForThisProcess(observer),
					(n) => n === 0,
				),
			).toBe(0);
			expect(
				await pollUntil(
					() => schemasForThisProcess(observer),
					(n) => n === 0,
				),
			).toBe(0);
		});
	});
});

/**
 * Every schema this process has built is named after its pid, and so is the
 * `application_name` on every pool the harness opened for one. Each case in
 * this file asserts its own cleanup, so anything left under the prefix is the
 * timed-out case's.
 */
const thisProcessPrefix = `simmer_test_${process.pid}_%`;

async function backendsForThisProcess(observer: pg.Client): Promise<number> {
	const { rows } = await observer.query<{ readonly count: string }>(
		'select count(*) as count from pg_stat_activity where application_name like $1',
		[thisProcessPrefix],
	);
	return Number(rows[0]?.count ?? '0');
}

async function schemasForThisProcess(observer: pg.Client): Promise<number> {
	const { rows } = await observer.query<{ readonly count: string }>(
		'select count(*) as count from pg_namespace where nspname like $1',
		[thisProcessPrefix],
	);
	return Number(rows[0]?.count ?? '0');
}

async function withObserver<T>(observe: (observer: pg.Client) => Promise<T>): Promise<T> {
	const observer = new Client({ connectionString: observerUrl });
	await observer.connect();
	try {
		return await observe(observer);
	} finally {
		await observer.end();
	}
}

/**
 * Backends the harness opened for one schema, by the `application_name` it
 * stamps on every pool.
 */
async function backendsFor(observer: pg.Client, schemaName: string): Promise<number> {
	const { rows } = await observer.query<{ readonly count: string }>(
		'select count(*) as count from pg_stat_activity where application_name = $1',
		[schemaName],
	);
	return Number(rows[0]?.count ?? '0');
}

async function schemaExists(observer: pg.Client, schemaName: string): Promise<boolean> {
	const { rows } = await observer.query('select 1 from pg_namespace where nspname = $1', [
		schemaName,
	]);
	return rows.length > 0;
}

/**
 * The schema whose migration set this process is applying right now, or null.
 *
 * The set goes out as one query opening with `set search_path to <schema>`,
 * and `pg_stat_activity` keeps the first kilobyte of it, so the prefix is
 * enough to tell the build from the harness's other statements. The process
 * id in the schema name keeps another worker's build out of the answer.
 */
async function activeMigrationBuild(observer: pg.Client): Promise<string | null> {
	const { rows } = await observer.query<{ readonly application_name: string }>(
		`select application_name from pg_stat_activity
		 where state = 'active'
		   and application_name like $1
		   and query like 'set search_path to simmer\\_test\\_%'`,
		[thisProcessPrefix],
	);
	return rows[0]?.application_name ?? null;
}

/**
 * Poll `read` until `until` holds, or until the observer's budget runs out,
 * and hand back the last answer either way so the assertion names it.
 */
async function pollUntil<T>(read: () => Promise<T>, until: (value: T) => boolean): Promise<T> {
	const deadline = Date.now() + OBSERVE_TIMEOUT_MS;
	let value = await read();
	while (!until(value) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		value = await read();
	}
	return value;
}
