#!/usr/bin/env node
/**
 * The `pg_dump` dbmate runs when `db-migrate.mjs` falls back to the compose
 * container's client: it runs `pg_dump` inside the container with the
 * arguments dbmate gave it, `--version` included, and passes the bytes through
 * unchanged, which is what writes `packages/db/schema.sql` byte for byte (#1305).
 *
 * Nothing calls it by name. The wrapper writes a `pg_dump.cmd` (or a `pg_dump`
 * shell script) that runs this file into a temporary directory, puts that
 * directory first on dbmate's PATH, and names the container in
 * `SIMMER_PG_DUMP_CONTAINER`. The one rewrite is the URL's host and port,
 * since the container reaches its own server on `127.0.0.1:5432` and not on
 * the port it publishes here; `containerDumpArgs` is that rule.
 *
 * No `-t` on the exec: a pseudo-terminal turns every line end into CRLF.
 */

import { spawnSync } from 'node:child_process';
import { CONTAINER_VARIABLE, containerDumpArgs } from './lib/schema-dump.mjs';

const container = process.env[CONTAINER_VARIABLE];
if (!container) {
	console.error(`${CONTAINER_VARIABLE} is not set; db-migrate.mjs sets it before dbmate runs.`);
	process.exit(1);
}

const result = spawnSync(
	'docker',
	['exec', container, 'pg_dump', ...containerDumpArgs(process.argv.slice(2))],
	{ stdio: 'inherit', windowsHide: true },
);
if (result.error) {
	console.error(`Could not run docker: ${result.error.message}`);
	process.exit(1);
}
process.exit(result.status ?? 1);
