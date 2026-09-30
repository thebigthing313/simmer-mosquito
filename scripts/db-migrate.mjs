#!/usr/bin/env node
/**
 * `pnpm db:migrate` and `pnpm db:rollback`: dbmate `up` or `rollback`,
 * refusing to run where it cannot write `packages/db/schema.sql` and failing
 * when the dump it left disagrees with what it did.
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
 * A rollback drops the dump the same way, and there the stale dump names a
 * version the database no longer has, which `check:table-types` cannot see
 * while the migration's file is still on disk (#1304). So `rollback` takes
 * the same refusal before dbmate runs, and after it returns a run that printed
 * a `Rolling back:` line has to have rewritten the dump without that version.
 *
 * Being on the PATH is not enough, because only `pg_dump` 17.0 to 17.5 writes
 * the checked-in bytes (#1305). So the wrapper asks the local client for its
 * version, and when there is none or it is outside that range, it hands dbmate
 * a `pg_dump` shim over the compose container's client, which is 17.5, as long
 * as the URL reaches that container through the port it publishes. It says so
 * on stdout. Anything else is refused before dbmate runs, naming the version
 * found (#1315). The URL dbmate reads gains `search_path=public` when it has
 * none, so the dump covers the `public` schema alone.
 *
 * The first argument is the dbmate command, `up` or `rollback`, which is what
 * the two package scripts pass, or `dump`, which rewrites the dump from the
 * database with the same client and URL and is what the stale-dump message
 * points at. The rest pass through to dbmate ahead of it, so
 * `pnpm db:migrate --url <url>` works as it did. A run that opts out of the
 * dump with `--no-dump-schema` or `DBMATE_NO_DUMP_SCHEMA` skips every check and
 * leaves the URL alone.
 */

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBinary } from 'dbmate';
import {
	afterDbmate,
	CONTAINER_VARIABLE,
	choosePgDump,
	containerNotice,
	findExecutable,
	PUBLISHED_PORT,
	parseEnvFile,
	pgDumpVersion,
	resolveDatabaseUrl,
	URL_VARIABLE,
	urlArguments,
	withPublicSearchPath,
	writesDump,
} from './lib/schema-dump.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = 'packages/db/schema.sql';
const MIGRATIONS_DIR = 'packages/db/migrations';
const SCHEMA_PATH = join(ROOT, SCHEMA_FILE);
const SHIM = join(ROOT, 'scripts', 'container-pg-dump.mjs');

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

/** The variables an env file sets, or none when it cannot be read, which is how dbmate treats a missing `.env`. */
function readEnvFile(path) {
	try {
		return parseEnvFile(readFileSync(resolve(ROOT, path), 'utf8'));
	} catch {
		return {};
	}
}

/** A docker command's stdout, or `null` when docker is missing or the command failed. */
function docker(args) {
	const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
	return result.error || result.status !== 0 ? null : result.stdout;
}

/**
 * The `pg_dump` dbmate would find on the PATH and the version it answers, or
 * `null` when there is none. A `.cmd` shim needs a shell to run, so the path
 * goes through one, quoted.
 */
function localPgDump() {
	const path = findExecutable('pg_dump', {
		platform: process.platform,
		path: process.env.PATH,
		pathext: process.env.PATHEXT,
		isFile,
	});
	if (path === null) return null;
	const answer = spawnSync(`"${path}" --version`, {
		shell: true,
		encoding: 'utf8',
		windowsHide: true,
	});
	return { path, version: pgDumpVersion(answer.stdout ?? '') };
}

const COMMANDS = new Set(['up', 'rollback', 'dump']);

const [command, ...passthrough] = process.argv.slice(2);
if (!COMMANDS.has(command)) {
	console.error(
		`Usage: node scripts/db-migrate.mjs <up|rollback|dump> [dbmate flags], got ${command ?? 'no command'}.`,
	);
	process.exit(2);
}
const checked = command === 'dump' || writesDump(passthrough, process.env);
const childEnv = { ...process.env };
let dbmateFlags = passthrough;
let removeShim = () => {};

/** The names of the running containers publishing the compose port, or `null` when docker cannot say. */
function listContainers() {
	const listed = docker(['ps', '--filter', `publish=${PUBLISHED_PORT}`, '--format', '{{.Names}}']);
	return listed === null ? null : listed.split(/\r?\n/).filter((name) => name !== '');
}

/** The version the container's own `pg_dump` answers, or `null`. */
function containerVersion(name) {
	return pgDumpVersion(docker(['exec', name, 'pg_dump', '--version']) ?? '');
}

/**
 * Writes a `pg_dump` that runs `container-pg-dump.mjs` into a temporary
 * directory and puts it first on dbmate's PATH. A `.cmd` on Windows, because
 * Go's lookup never takes a file with no extension there.
 */
function installShim(name) {
	const dir = mkdtempSync(join(tmpdir(), 'simmer-pg-dump-'));
	if (process.platform === 'win32') {
		writeFileSync(join(dir, 'pg_dump.cmd'), `@"${process.execPath}" "${SHIM}" %*\r\n`);
	} else {
		const file = join(dir, 'pg_dump');
		writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${SHIM}" "$@"\n`);
		chmodSync(file, 0o755);
	}
	// Windows spells it `Path`, and a copied env object is case-sensitive.
	const key = Object.keys(childEnv).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
	childEnv[key] = `${dir}${delimiter}${childEnv[key] ?? ''}`;
	childEnv[CONTAINER_VARIABLE] = name;
	return () => rmSync(dir, { recursive: true, force: true });
}

if (checked) {
	const source = urlArguments(passthrough);
	const url = resolveDatabaseUrl({
		url: source.url,
		env: source.env,
		processEnv: process.env,
		files: (source.envFiles.length > 0 ? source.envFiles : ['.env']).map(readEnvFile),
	});
	if (url !== null) {
		childEnv[URL_VARIABLE] = withPublicSearchPath(url);
		dbmateFlags = [...source.rest, '--env', URL_VARIABLE];
	}

	const choice = choosePgDump({
		command,
		local: localPgDump(),
		url,
		platform: process.platform,
		listContainers,
		containerVersion,
	});
	if (choice.refusal) {
		console.error(choice.refusal);
		process.exit(1);
	}
	if (choice.use === 'container') {
		removeShim = installShim(choice.name);
		console.log(containerNotice(choice));
	}
}

const args = [
	'--migrations-dir',
	MIGRATIONS_DIR,
	'--schema-file',
	SCHEMA_FILE,
	...dbmateFlags,
	command,
];

const writtenBefore = modifiedAt(SCHEMA_PATH);

// stdout is read for the `Applying:` and `Rolling back:` lines and echoed as it arrives.
const child = spawn(resolveBinary(), args, {
	cwd: ROOT,
	env: childEnv,
	stdio: ['inherit', 'pipe', 'inherit'],
});
let output = '';
child.stdout.on('data', (chunk) => {
	output += chunk;
	process.stdout.write(chunk);
});

child.on('error', (error) => {
	removeShim();
	console.error(`Could not start dbmate: ${error.message}`);
	process.exit(1);
});

child.on('close', (code) => {
	removeShim();
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
