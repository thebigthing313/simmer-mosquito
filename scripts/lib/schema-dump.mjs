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

/**
 * Printed before dbmate runs, when `pg_dump` is nowhere on the PATH. `command`
 * is the dbmate command the wrapper was about to run, `up` or `rollback`.
 */
export function missingPgDumpMessage(command) {
	const [refused, changed, script] =
		command === 'rollback'
			? [
					'pg_dump is not on the PATH, so nothing was rolled back.',
					'rolls back a migration, and it ignores a failure there: the rollback would',
					'`pnpm db:rollback`',
				]
			: [
					'pg_dump is not on the PATH, so no migration was applied.',
					'applies a migration, and it ignores a failure there: the migration would',
					'`pnpm db:migrate`',
				];
	return [
		refused,
		'',
		'dbmate writes packages/db/schema.sql by running pg_dump after it',
		changed,
		'land in the database and schema.sql would stay as it was, which is what',
		'`pnpm generate:table-types` reads next.',
		'',
		'Install the PostgreSQL client tools and put their bin directory on the PATH',
		'(on Windows, `C:\\Program Files\\PostgreSQL\\<version>\\bin`), or run',
		`${script} from a shell where \`pg_dump --version\` answers.`,
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
		'pg_dump, so check that pg_dump runs and that its major version is at',
		"least the server's, then write the dump without changing the database:",
		'',
		'  pnpm exec dbmate --schema-file packages/db/schema.sql dump',
	].join('\n');
}
