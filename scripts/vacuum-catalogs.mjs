#!/usr/bin/env node
/**
 * Runs `vacuum full` over the system catalogs of the compose Postgres and
 * prints what each one weighed before and after.
 *
 * Every database-backed test builds a throwaway `simmer_test_*` schema, applies
 * the whole migration set into it and drops it, which writes and deletes a
 * few thousand catalog rows per test. Autovacuum reclaims the space inside
 * those catalogs and never gives a page back, so months of runs leave
 * `pg_depend` at 149 MB and `pg_attribute` at 79 MB for zero live rows, and
 * every catalog scan the next schema build makes walks the whole of it. #926
 * measured the same suite at 4.6s on a fresh container and 27s on this one.
 * `vacuum full` rewrites a catalog into a new file and is the one thing that
 * shrinks it, and it is what this runs. `pnpm db:vacuum-catalogs` is the
 * command.
 *
 * ## The lock rule
 *
 * `vacuum full` takes an access exclusive lock on each catalog for the whole
 * rewrite, and every session needs the catalogs, so anything connected sits
 * on that lock, and a suite mid-run sits on it once per statement. So the run
 * refuses when any other client backend is on the database, the local
 * Electric's pool and a dev API server included, and names each one. A
 * `walsender` is not a client backend and is left out on purpose: Electric's
 * slot holds no relation lock, and a rewrite decodes to nothing, because the
 * reorder buffer drops changes on a rewrite heap before the output plugin sees
 * them, which ADR 0018 measured at zero bytes for the `regions.geom` rewrite.
 * Stopping the Electric container clears its twenty pooled connections either
 * way, because the pool is what the rule sees.
 *
 * ## The container, not the project
 *
 * It reaches Postgres through `docker exec` on whichever container publishes
 * `55432`, the port `TEST_DATABASE_URL` reaches, rather than through `docker
 * compose exec`. The lookup shipped to route around the compose project name,
 * which came from the directory holding the compose file until #1122 pinned
 * it, so a worktree under `.claude/worktrees/` addressed a project that did
 * not exist. It stays because a hand-started container is in no compose
 * project at all, and the port is the one fact the script and the suites
 * share either way. `psql` runs inside the container, so nothing needs to be
 * installed on the host.
 *
 * ## It is a fixer, and it is not a gate
 *
 * It changes the database rather than reporting on it, so it is not named
 * `check:*` and `pnpm check:all` neither runs it nor has to excuse it, which is
 * `clean:build-info`'s shape. Everything that can be said about text is in
 * `lib/catalog-vacuum.mjs` under a suite; this file owns Docker, the streams
 * and the exit code.
 */

import { spawnSync } from 'node:child_process';
import {
	CATALOGS,
	parseSession,
	report,
	sessionFailure,
	sessionSql,
} from './lib/catalog-vacuum.mjs';

/** The host port `docker-compose.yml` publishes Postgres on. */
const PUBLISHED_PORT = 55432;

const DATABASE = 'simmer_mosquito';
const ROLE = 'postgres';

/** Runs a docker command and returns its stdout, or exits naming the failure. */
function docker(args, input) {
	const result = spawnSync('docker', args, { encoding: 'utf8', input, windowsHide: true });
	if (result.error) {
		console.error(`Could not run docker: ${result.error.message}`);
		process.exit(1);
	}
	if (result.status !== 0) {
		console.error(`docker ${args.slice(0, 2).join(' ')} exited ${result.status}.`);
		console.error(result.stderr.trim());
		process.exit(1);
	}
	return result.stdout;
}

/** The one container publishing the port, or an exit saying why there is not one. */
function postgresContainer() {
	const names = docker(['ps', '--filter', `publish=${PUBLISHED_PORT}`, '--format', '{{.Names}}'])
		.split(/\r?\n/)
		.filter((name) => name !== '');

	if (names.length === 1) return names[0];

	console.error(
		names.length === 0
			? `No running container publishes port ${PUBLISHED_PORT}. Start the compose Postgres with docker compose up -d postgres and run again.`
			: `${names.length} running containers publish port ${PUBLISHED_PORT}, ${names.join(', ')}, and this cannot say which is the compose Postgres.`,
	);
	process.exit(1);
}

function main() {
	const container = postgresContainer();
	const stdout = docker(
		['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-U', ROLE, '-d', DATABASE],
		sessionSql(),
	);
	const session = parseSession(stdout);

	const failure = sessionFailure(session, DATABASE);
	if (failure !== null) {
		console.error(failure);
		process.exit(1);
	}

	console.log(`Vacuumed ${CATALOGS.length} system catalogs in ${container}.\n`);
	console.log(report(session.before, session.after));
}

main();
