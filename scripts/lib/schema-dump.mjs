/**
 * The half of `db-migrate.mjs` that is text in and text out: where `pg_dump`
 * would be found, which versions `packages/db/schema.sql` names, which versions
 * dbmate says it applied or rolled back, and the two refusals the wrapper
 * prints. The wrapper
 * owns dbmate, the streams and the exit code, which is the split
 * `catalog-vacuum.mjs` makes under `vacuum-catalogs.mjs`.
 *
 * ## Why the wrapper exists
 *
 * dbmate writes the dump by running `pg_dump` after it applies a migration,
 * and it discards any error from that step, so with no `pg_dump` on the PATH
 * `pnpm db:migrate` applied the migration, left the dump as it was and exited
 * 0 (#1271). The next command, `pnpm generate:table-types`, then read a dump
 * naming no new migration and failed pointing at itself.
 *
 * ## Where `pg_dump` is looked for
 *
 * `findExecutable` walks the PATH the way Go's `exec.LookPath` does, since
 * that is what dbmate calls: on Windows it tries each `PATHEXT` extension and
 * never a bare name, and elsewhere it takes the name as written. Asking
 * Node's `spawn` instead would disagree on Windows, where libuv tries `.com`
 * and `.exe` only, so a `pg_dump.cmd` shim dbmate would run reads as missing.
 *
 * ## Which `pg_dump` may write it
 *
 * The checked-in dump is what `pg_dump` 17.0 to 17.5 writes (#1305). From 17.6
 * dbmate passes `--restrict-key`, and the dump gains a `\restrict` pair and two
 * comments naming both versions, 8 lines that pass every gate and churn on
 * every migration. So a local client outside that range is not used, and the
 * compose container's 17.5 takes its place when the URL reaches it through the
 * published port (#1315). The wrapper asks the questions that need a process;
 * `pgDumpVersion`, `dumpsCheckedInBytes`, `containerProblem` and the messages
 * answer them.
 *
 * ## The URL dbmate reads
 *
 * dbmate asks `pg_dump` for one `--schema` per `search_path` entry on its URL,
 * and with none it dumps the whole database, extensions included, 54 lines
 * more on a fresh one. `.env`'s `DATABASE_URL` carries none because the dev
 * server reads it too, so the wrapper resolves the URL dbmate would read, adds
 * `search_path=public` when it is absent, and hands dbmate the result through
 * an environment variable of its own. That also keeps the URL off `cmd.exe`,
 * which splits an argument at `&` when `pnpm.cmd` runs the script.
 */

import { posix, win32 } from 'node:path';

/** `('202605120001'),` in the `schema_migrations` insert dbmate appends. */
const DUMPED_VERSION = /^\s*\('(\d+)'\)[,;]\r?$/gm;

/** `Applying: 202609290001_name.sql`, one line per migration dbmate runs. */
const APPLYING = /^Applying: (?:.*[\\/])?(\d+)_[^\\/\r\n]*\r?$/gm;

/** `Rolling back: 202609290001_name.sql`, the line dbmate prints before it runs a down block. */
const ROLLING_BACK = /^Rolling back: (?:.*[\\/])?(\d+)_[^\\/\r\n]*\r?$/gm;

/** Go's own fallback when `PATHEXT` is unset. */
const DEFAULT_PATHEXT = '.com;.exe;.bat;.cmd';

/** What Go's `strconv.ParseBool` reads as true, which is how dbmate reads its flag's variable. */
const GO_TRUE = new Set(['1', 't', 'T', 'TRUE', 'true', 'True']);

/**
 * Whether dbmate will try to write the dump on this run. A caller who opted
 * out with `--no-dump-schema` or `DBMATE_NO_DUMP_SCHEMA` asked for a stale
 * dump, and neither check applies.
 */
export function writesDump(args, env) {
	return !args.includes('--no-dump-schema') && !GO_TRUE.has(env.DBMATE_NO_DUMP_SCHEMA ?? '');
}

/** The versions a dump's `schema_migrations` insert names, sorted. */
export function dumpedVersions(sql) {
	return [...sql.matchAll(DUMPED_VERSION)].map((match) => match[1]).sort();
}

/** The versions dbmate printed an `Applying:` line for, in the order it ran them. */
export function appliedVersions(output) {
	return [...output.matchAll(APPLYING)].map((match) => match[1]);
}

/** The versions dbmate printed a `Rolling back:` line for. */
export function rolledBackVersions(output) {
	return [...output.matchAll(ROLLING_BACK)].map((match) => match[1]);
}

/**
 * What is wrong with the dump after a run, or `null` when nothing is.
 *
 * Both halves are needed. On a fresh database dbmate applies every migration
 * the checked-in dump already names, so with `pg_dump` failing the versions
 * alone read clean; measured on a scratch database with a `pg_dump` that exits
 * 1, dbmate applied all of them, printed no `Writing:` line and exited 0. And a
 * dump that was rewritten can still leave a version out, which is the check
 * `generate-table-types.mjs` makes against the files on disk.
 *
 * A rollback is the same question turned round: the dump must have been
 * rewritten and must no longer name the version. `check:table-types` cannot
 * ask it, because the rolled-back migration's file is usually still on disk,
 * so a dump that kept naming it agrees with the files (#1304).
 */
export function staleDump({ applied, rolledBack, dumped, rewritten }) {
	if (applied.length === 0 && rolledBack.length === 0) {
		return null;
	}
	const named = new Set(dumped);
	const undumped = applied.filter((version) => !named.has(version));
	const lingering = rolledBack.filter((version) => named.has(version));
	if (rewritten && undumped.length === 0 && lingering.length === 0) {
		return null;
	}
	return { rewritten, undumped, lingering };
}

/**
 * The file a command name resolves to on the given PATH, or `null`.
 *
 * `isFile` is the one filesystem question, passed in so the suite can answer it.
 * An empty PATH entry is skipped rather than read as the working directory,
 * which is what Go has done since 1.19.
 */
export function findExecutable(name, { platform, path, pathext, isFile }) {
	const windows = platform === 'win32';
	const join = windows ? win32.join : posix.join;
	const entries = (path ?? '').split(windows ? ';' : ':').filter((entry) => entry !== '');
	const extensions = windows
		? (pathext || DEFAULT_PATHEXT).split(';').filter((extension) => extension !== '')
		: [''];

	for (const entry of entries) {
		for (const extension of extensions) {
			const candidate = join(entry, `${name}${extension}`);
			if (isFile(candidate)) {
				return candidate;
			}
		}
	}
	return null;
}

/** The host port `docker-compose.yml` publishes Postgres on, and the port inside the container. */
export const PUBLISHED_PORT = 55432;
const CONTAINER_PORT = 5432;

/** The variable the wrapper hands dbmate its URL through, which dbmate reads with `--env`. */
export const URL_VARIABLE = 'SIMMER_DBMATE_URL';

/** The variable naming the container `container-pg-dump.mjs` runs `pg_dump` in. */
export const CONTAINER_VARIABLE = 'SIMMER_PG_DUMP_CONTAINER';

/** `pg_dump (PostgreSQL) 17.5 (Debian 17.5-1.pgdg110+1)`, what `pg_dump --version` prints. */
const PG_DUMP_VERSION = /^pg_dump \(PostgreSQL\) (\d+)\.(\d+)\b/m;

/**
 * The `major.minor` a `pg_dump --version` answer names, or `null` when it names
 * none. A beta, `18beta1`, has no minor and reads as `null`, which the wrapper
 * refuses the same way.
 */
export function pgDumpVersion(answer) {
	const match = PG_DUMP_VERSION.exec(answer);
	return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

/** Whether a client at this version writes `packages/db/schema.sql` byte for byte: 17.0 to 17.5. */
export function dumpsCheckedInBytes(version) {
	return version !== null && version.major === 17 && version.minor <= 5;
}

function versionText(version) {
	return `${version.major}.${version.minor}`;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const POSTGRES_SCHEMES = new Set(['postgres:', 'postgresql:']);

function parseUrl(url) {
	try {
		return new URL(url);
	} catch {
		return null;
	}
}

/** Whether a URL reaches the compose Postgres through the port it publishes on this machine. */
function reachesPublishedPort(parsed) {
	return (
		parsed !== null &&
		POSTGRES_SCHEMES.has(parsed.protocol) &&
		LOOPBACK.has(parsed.hostname) &&
		Number(parsed.port) === PUBLISHED_PORT
	);
}

/**
 * The URL with `search_path=public` added when it carries no `search_path`,
 * and untouched otherwise, a caller's own `search_path` included. The rest of
 * the text is kept as written, since a password may hold escapes `URL` would
 * spell differently.
 */
export function withPublicSearchPath(url) {
	const parsed = parseUrl(url);
	if (parsed === null || parsed.searchParams.has('search_path')) {
		return url;
	}
	const [base, fragment] = url.split(/(?=#)/);
	return `${base}${base.includes('?') ? '&' : '?'}search_path=public${fragment ?? ''}`;
}

/** One flag dbmate reads a URL from, in each spelling urfave/cli takes. */
function flagValue(args, index, names) {
	const arg = args[index];
	for (const name of names) {
		if (arg === name) return { value: args[index + 1], consumed: 2 };
		if (arg.startsWith(`${name}=`)) return { value: arg.slice(name.length + 1), consumed: 1 };
	}
	return null;
}

/**
 * Where the arguments tell dbmate to read its URL: `--url`, `--env` and every
 * `--env-file`. `rest` is the arguments without `--url` and `--env`, which the
 * wrapper replaces with its own `--env`; `--env-file` stays, because dbmate
 * reads other variables from those files too.
 */
export function urlArguments(args) {
	const found = { url: undefined, env: undefined, envFiles: [], rest: [] };
	for (let index = 0; index < args.length; ) {
		const url = flagValue(args, index, ['--url', '-u']);
		const env = url ?? flagValue(args, index, ['--env', '-e']);
		const envFile = env ? null : flagValue(args, index, ['--env-file']);
		if (url) {
			found.url = url.value;
		} else if (env) {
			found.env = env.value;
		} else if (envFile) {
			found.envFiles.push(envFile.value);
			found.rest.push(...args.slice(index, index + envFile.consumed));
		} else {
			found.rest.push(args[index]);
		}
		index += (url ?? env ?? envFile)?.consumed ?? 1;
	}
	return found;
}

/**
 * The variables a dotenv file sets. It reads the lines this repo writes,
 * `KEY=value` with an optional `export`, quotes and a trailing comment, and
 * skips anything else rather than guessing.
 */
export function parseEnvFile(text) {
	const values = {};
	for (const line of text.split(/\r?\n/)) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!match) continue;
		const raw = match[2].trim();
		const quoted = /^(["'])(.*)\1$/.exec(raw);
		values[match[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
	}
	return values;
}

/**
 * The URL dbmate would read, or `null` when it would find none. `--url` wins,
 * then the variable `--env` names, `DATABASE_URL` by default, from the process
 * and then from each env file in order. godotenv never overrides a variable
 * already set, so the process wins over a file and an earlier file over a
 * later one.
 */
export function resolveDatabaseUrl({ url, env, processEnv, files }) {
	if (url !== undefined) return url || null;
	const name = env ?? 'DATABASE_URL';
	if (processEnv[name] !== undefined) return processEnv[name] || null;
	for (const file of files) {
		if (file[name] !== undefined) return file[name] || null;
	}
	return null;
}

/**
 * Why the compose container's `pg_dump` cannot dump the database this URL
 * names, or `null` when it can. The container reaches its own server on
 * `127.0.0.1:5432`, so the URL has to be the one that reaches that server from
 * here. On Windows the shim dbmate runs is a `.cmd`, and `cmd.exe` splits its
 * arguments at `&`, so the URL dbmate hands `pg_dump`, which is this one less
 * `search_path`, may carry one query parameter and no more.
 */
export function containerUrlProblem(url, platform) {
	if (url === null) {
		return 'no database URL was found, so nothing says the database is the compose one';
	}
	const parsed = parseUrl(url);
	if (!reachesPublishedPort(parsed)) {
		return `the database URL does not reach the compose Postgres on 127.0.0.1:${PUBLISHED_PORT}`;
	}
	const kept = [...parsed.searchParams.keys()].filter((key) => key !== 'search_path');
	if (platform === 'win32' && kept.length > 1) {
		return `the URL carries ${kept.length} query parameters besides search_path (${kept.join(', ')}), and cmd.exe would split the shim's arguments at the & between them`;
	}
	return null;
}

/** Why the running containers publishing the port are not one to use, or `null` when they are. */
export function containerNameProblem(names) {
	if (names === null) return 'docker did not answer';
	if (names.length === 0) return `no running container publishes port ${PUBLISHED_PORT}`;
	if (names.length > 1) {
		return `${names.length} running containers publish port ${PUBLISHED_PORT}, ${names.join(', ')}, and nothing says which is the compose Postgres`;
	}
	return null;
}

/** Why the container's own `pg_dump` is not one to use, or `null` when it is. */
export function containerVersionProblem(name, version) {
	if (dumpsCheckedInBytes(version)) return null;
	return version === null
		? `pg_dump in ${name} names no version`
		: `pg_dump in ${name} is ${versionText(version)}`;
}

/**
 * The arguments dbmate gave the shim, with the URL pointed at the server from
 * inside the container. Only a loopback URL on the published port is
 * rewritten, and only its host and port, so every flag and every query
 * parameter reaches `pg_dump` as dbmate wrote it.
 */
export function containerDumpArgs(args) {
	return args.map((arg) => {
		const parsed = parseUrl(arg);
		if (!reachesPublishedPort(parsed)) return arg;
		const authority = /^([a-z]+:\/\/(?:[^@/]*@)?)(\[::1\]|[^:/?#]+):(\d+)/i;
		return arg.replace(authority, `$1127.0.0.1:${CONTAINER_PORT}`);
	});
}

/**
 * Which `pg_dump` writes the dump: `{ use: 'path' }` when the one on the PATH
 * is 17.0 to 17.5, `{ use: 'container', name, version, local }` when the
 * compose container's stands in, and `{ refusal }` when neither can. The two
 * docker questions are functions, asked only when the local client will not
 * do: `listContainers()` answers the names publishing the port or `null`, and
 * `containerVersion(name)` the version its `pg_dump` answers or `null`.
 */
export function choosePgDump({ command, local, url, platform, listContainers, containerVersion }) {
	if (local !== null && dumpsCheckedInBytes(local.version)) return { use: 'path' };
	const refuse = (problem) => ({ refusal: pgDumpRefusal({ command, local, problem }) });

	const urlProblem = containerUrlProblem(url, platform);
	if (urlProblem !== null) return refuse(urlProblem);

	const names = listContainers();
	const nameProblem = containerNameProblem(names);
	if (nameProblem !== null) return refuse(nameProblem);

	const [name] = names;
	const version = containerVersion(name);
	const versionProblem = containerVersionProblem(name, version);
	if (versionProblem !== null) return refuse(versionProblem);

	return { use: 'container', name, version, local };
}

/** The line the wrapper prints when the container's `pg_dump` writes the dump. */
export function containerNotice({ name, version, local }) {
	const why =
		local === null ? 'no pg_dump is on the PATH' : `${describeLocal(local)} is not 17.0 to 17.5`;
	return `Writing the dump with pg_dump ${versionText(version)} in ${name}, because ${why}.`;
}

/** A local `pg_dump` as a message names it: its version and where it is. */
function describeLocal({ path, version }) {
	return version === null
		? `the pg_dump at ${path}, whose --version answer names no version,`
		: `pg_dump ${versionText(version)} at ${path}`;
}

/**
 * Printed before dbmate runs, when no `pg_dump` that writes the checked-in
 * bytes can be used. `command` is the dbmate command the wrapper was about to
 * run, `up` or `rollback`; `local` is the `pg_dump` on the PATH, or `null`
 * when there is none; `problem` is why the container's could not stand in.
 */
export function pgDumpRefusal({ command, local, problem }) {
	const outcome = command === 'rollback' ? 'nothing was rolled back' : 'no migration was applied';
	const script = command === 'rollback' ? '`pnpm db:rollback`' : '`pnpm db:migrate`';
	const changed =
		command === 'rollback'
			? 'rolls back a migration, and it ignores a failure there: the rollback would'
			: 'applies a migration, and it ignores a failure there: the migration would';
	const why =
		local === null
			? [
					`pg_dump is not on the PATH, so ${outcome}.`,
					'',
					'dbmate writes packages/db/schema.sql by running pg_dump after it',
					changed,
					'land in the database and schema.sql would stay as it was, which is what',
					'`pnpm generate:table-types` reads next.',
				]
			: [
					`${describeLocal(local)} is not 17.0 to 17.5, so ${outcome}.`,
					'',
					'packages/db/schema.sql is what pg_dump 17.0 to 17.5 writes. From 17.6 dbmate',
					'passes --restrict-key, and the dump gains \\restrict lines and two comments',
					'naming both versions, which change the file on every migration.',
				];
	return [
		...why,
		'',
		`The compose container's pg_dump cannot stand in, because ${problem}.`,
		'',
		`Run ${script} again with one of these:`,
		'- the PostgreSQL 17 client tools at 17.5 or older first on the PATH;',
		`- the compose Postgres running (docker compose up -d postgres) and the URL on`,
		`  127.0.0.1:${PUBLISHED_PORT}, which makes the wrapper dump through the container's pg_dump.`,
		'CLAUDE.md, Database, says why the version matters.',
	].join('\n');
}

/**
 * The wrapper's exit code once dbmate has returned, and what to print with it.
 *
 * A failed dbmate keeps its own code and its own message. A run that opted out
 * of the dump passes, and anything else passes only when `staleDump` finds
 * nothing.
 */
export function afterDbmate({ code, checked, output, sql, rewritten }) {
	if (code !== 0) {
		return { exitCode: code ?? 1, message: null };
	}
	const stale = checked
		? staleDump({
				applied: appliedVersions(output),
				rolledBack: rolledBackVersions(output),
				dumped: dumpedVersions(sql),
				rewritten,
			})
		: null;
	return stale === null
		? { exitCode: 0, message: null }
		: { exitCode: 1, message: staleDumpMessage(stale) };
}

/** Printed after dbmate returns, for what `staleDump` found. */
export function staleDumpMessage({ rewritten, undumped, lingering }) {
	const rollback = lingering.length > 0;
	let found;
	if (!rewritten) {
		found = [
			rollback
				? 'dbmate rolled back a migration and did not rewrite packages/db/schema.sql.'
				: 'dbmate applied migrations and did not rewrite packages/db/schema.sql.',
		];
	} else if (rollback) {
		found = [
			'dbmate rolled back migrations that packages/db/schema.sql still names:',
			...lingering.map((version) => `  ${version}`),
		];
	} else {
		found = [
			'dbmate applied migrations that packages/db/schema.sql does not name:',
			...undumped.map((version) => `  ${version}`),
		];
	}
	return [
		...found,
		'',
		'The database has changed and the dump is stale. dbmate ignores a failed',
		'pg_dump, so check that the pg_dump this run used answers --version, then',
		'write the dump without changing the database, through the same wrapper:',
		'',
		'  node scripts/db-migrate.mjs dump',
	].join('\n');
}
