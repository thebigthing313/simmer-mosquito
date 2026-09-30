#!/usr/bin/env node
/**
 * `pnpm db:migrate`: dbmate `up`, refusing to run where it cannot write
 * `packages/db/schema.sql` and failing when it applied a migration the dump
 * does not name.
 *
 * dbmate discards the error when its `pg_dump` step fails, so without this a
 * machine with no `pg_dump` on the PATH applied the migration, kept the old
 * dump and exited 0 (#1271). Two checks close that. Before dbmate runs,
 * `pg_dump` has to be on the PATH, found the way dbmate's own lookup finds it,
 * or nothing is applied. After it returns, a run that printed an `Applying:`
 * line has to have rewritten the dump, and the dump has to name every version
 * applied, which is what catches a `pg_dump` that is there and failed anyway,
 * an old client refusing a newer server being the usual one. The reading and
 * the messages are `lib/schema-dump.mjs`, where the suite reaches them.
 *
 * Arguments pass through to dbmate ahead of `up`, so `pnpm db:migrate --url
 * <url>` works as it did. A run that opts out of the dump with
 * `--no-dump-schema` or `DBMATE_NO_DUMP_SCHEMA` skips both checks.
 */

import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBinary } from 'dbmate';
import {
	afterDbmate,
	findExecutable,
	missingPgDumpMessage,
	writesDump,
} from './lib/schema-dump.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = 'packages/db/schema.sql';
const MIGRATIONS_DIR = 'packages/db/migrations';
const SCHEMA_PATH = join(ROOT, SCHEMA_FILE);

function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/** The file's modification time, or `null` when it does not exist. */
function modifiedAt(path) {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return null;
	}
}

const passthrough = process.argv.slice(2);
const checked = writesDump(passthrough, process.env);

if (
	checked &&
	findExecutable('pg_dump', {
		platform: process.platform,
		path: process.env.PATH,
		pathext: process.env.PATHEXT,
		isFile,
	}) === null
) {
	console.error(missingPgDumpMessage());
	process.exit(1);
}

const args = [
	'--migrations-dir',
	MIGRATIONS_DIR,
	'--schema-file',
	SCHEMA_FILE,
	...passthrough,
	'up',
];

const writtenBefore = modifiedAt(SCHEMA_PATH);

// stdout is read for the `Applying:` lines and echoed as it arrives.
const child = spawn(resolveBinary(), args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'inherit'] });
let output = '';
child.stdout.on('data', (chunk) => {
	output += chunk;
	process.stdout.write(chunk);
});

child.on('error', (error) => {
	console.error(`Could not start dbmate: ${error.message}`);
	process.exit(1);
});

child.on('close', (code) => {
	const verdict = afterDbmate({
		code,
		checked,
		output,
		sql: readFileSync(SCHEMA_PATH, 'utf8'),
		rewritten: modifiedAt(SCHEMA_PATH) !== writtenBefore,
	});
	if (verdict.message !== null) {
		console.error(`\n${verdict.message}`);
	}
	process.exit(verdict.exitCode);
});
