/**
 * The half of `vacuum-catalogs.mjs` that is text in and text out: the psql
 * session the runner sends, the reader for what comes back, and the
 * messages it prints. The runner owns Docker, the streams and the exit code,
 * which is the split `fallow-comparison.mjs` makes under `fallow.mjs` and for
 * the same reason, so that a suite can hold every rule without a container.
 *
 * ## One session
 *
 * The backend check, the vacuum and both measurements go down one psql
 * connection as one script. The check is a `\gset` into a boolean and a
 * `\if` that quits, so nothing is vacuumed on a run that found company, and
 * the gap between the check and the first `vacuum full` is a few statements
 * on the same backend rather than a second process start. A suite can still
 * connect inside that gap; what the rule buys is that a run never starts on
 * top of one that is already there.
 *
 * ## What is vacuumed
 *
 * `CATALOGS` is the register. It is the catalogs a throwaway schema build
 * writes rows into, tables, columns, types, constraints, triggers, indexes,
 * defaults, enums, functions, dependencies, view rules, comments and
 * statistics, plus the shared dependency catalog. Measured on the compose
 * container on 2026-09-17, after months of `simmer_test_*` builds, the first
 * five held 149, 79, 69, 41 and 36 MB for zero live rows, and every other
 * catalog in `pg_catalog` was under 300 kB. A catalog off the list costs
 * nothing to add and a bloated one off the list is the whole failure, so the
 * list is wide.
 */

/** The catalogs vacuumed, in the order a schema build fills them. */
export const CATALOGS = [
	'pg_depend',
	'pg_attribute',
	'pg_trigger',
	'pg_constraint',
	'pg_class',
	'pg_attrdef',
	'pg_index',
	'pg_type',
	'pg_proc',
	'pg_enum',
	'pg_statistic',
	'pg_rewrite',
	'pg_description',
	'pg_namespace',
	'pg_shdepend',
];

const OTHER_BACKENDS =
	"from pg_stat_activity where datname = current_database() and backend_type = 'client backend' and pid <> pg_backend_pid()";

const SIZES = `select relname, pg_total_relation_size(oid) from pg_class where relnamespace = 'pg_catalog'::regnamespace and relname in (${CATALOGS.map((name) => `'${name}'`).join(', ')}) order by relname;`;

/**
 * The script psql runs, read from stdin under `-A -t` so each row is one
 * `|`-separated line and each `\echo` marker is one line of its own.
 */
export function sessionSql() {
	return [
		'\\set ON_ERROR_STOP on',
		'\\echo == backends',
		`select pid, coalesce(host(client_addr), 'socket'), coalesce(nullif(application_name, ''), '-'), state ${OTHER_BACKENDS} order by backend_start;`,
		`select count(*) > 0 as busy ${OTHER_BACKENDS} \\gset`,
		'\\if :busy',
		'\\quit',
		'\\endif',
		'\\echo == before',
		SIZES,
		...CATALOGS.map((name) => `vacuum full pg_catalog.${name};`),
		'\\echo == after',
		SIZES,
		'',
	].join('\n');
}

/**
 * Splits the session's stdout on its `== name` markers into named sections,
 * each a list of the rows under it.
 */
function sections(stdout) {
	const found = new Map();
	let current = null;

	for (const line of stdout.split(/\r?\n/)) {
		const marker = /^== (\w+)$/.exec(line);
		if (marker) {
			current = [];
			found.set(marker[1], current);
			continue;
		}
		if (current !== null && line !== '') current.push(line);
	}

	return found;
}

/**
 * `relname|bytes` rows as a `{ [relname]: bytes }` object. A row of any other
 * shape is refused by name: psql prints a command tag per statement unless it
 * runs quiet, and a tag read as a row is a catalog called VACUUM weighing NaN.
 */
function sizes(rows) {
	return Object.fromEntries(
		rows.map((row) => {
			const match = /^(\w+)\|(\d+)$/.exec(row);
			if (!match) throw new Error(`Expected a relname|bytes row from psql and read: ${row}`);
			return [match[1], Number(match[2])];
		}),
	);
}

/**
 * What the session said. `before` and `after` are `null` on a run that quit
 * at the backend check, and the backends it found are why.
 */
export function parseSession(stdout) {
	const found = sections(stdout);
	if (!found.has('backends')) {
		throw new Error(
			'The psql session printed no backends section, so it did not run as sent. Its output:\n' +
				stdout,
		);
	}

	const backends = (found.get('backends') ?? []).map((row) => {
		const [pid, address, application, state] = row.split('|');
		return { pid: Number(pid), address, application, state };
	});
	const before = found.has('before') ? sizes(found.get('before')) : null;
	const after = found.has('after') ? sizes(found.get('after')) : null;

	return { backends, before, after };
}

/** Whether an address is the compose network's gateway, which is this machine. */
const isGateway = (address) => /\.1$/.test(address);

/**
 * The message a refused run prints. It names the lock rule, lists what it
 * found, and says which of the two usual holders each address is, because
 * twenty idle connections from one address inside the network is the local
 * Electric's pool and a person reading a pid list would not know that.
 */
export function refusal(backends, database) {
	const inside = backends.filter((backend) => !isGateway(backend.address));
	const gateway = backends.find((backend) => isGateway(backend.address));

	const lines = [
		`Refusing to vacuum: ${backends.length} other backends are connected to ${database}.`,
		'vacuum full takes an access exclusive lock on each catalog, so anything connected sits',
		'on that lock for the whole rewrite, and a test suite building a schema queues on every',
		'statement. Stop what holds these connections and run again.',
		'',
		...backends.map(
			(backend) => `  ${backend.pid}  ${backend.address}  ${backend.application}  ${backend.state}`,
		),
	];

	if (inside.length > 0) {
		const addresses = [...new Set(inside.map((backend) => backend.address))].join(', ');
		lines.push(
			'',
			`${addresses} is inside the compose network, which is the electric service's own pool.`,
			'docker compose stop electric clears it; docker compose start electric brings it back',
			'afterwards and costs one re-snapshot.',
		);
	}
	if (gateway) {
		lines.push(
			'',
			`${gateway.address} is the compose network's gateway, so those connections are processes`,
			'on this machine: a dev API server, a psql, or a test run.',
		);
	}

	return lines.join('\n');
}

/**
 * Why a session is not one to report on, or `null` when it is. Three shapes:
 * it quit at the backend check, it ran and printed no sizes, or it measured a
 * list that is not the register, which is a name in `CATALOGS` that is not a
 * relation in `pg_catalog` on that server.
 */
export function sessionFailure(session, database) {
	if (session.backends.length > 0) return refusal(session.backends, database);
	if (session.before === null || session.after === null) {
		return 'The session found no other backend and still printed no sizes.';
	}
	const missing = CATALOGS.filter((name) => !(name in session.before));
	if (missing.length > 0) {
		return `Measured ${CATALOGS.length - missing.length} of the ${CATALOGS.length} catalogs CATALOGS names; not in pg_catalog on this server: ${missing.join(', ')}.`;
	}
	return null;
}

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

/** Bytes as a person reads them, one decimal, in the binary units psql uses. */
export function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** The table a run that vacuumed prints, one catalog per line, largest first. */
export function report(before, after) {
	const names = Object.keys(before).sort((a, b) => before[b] - before[a]);
	const width = Math.max(...names.map((name) => name.length)) + 2;
	const reclaimed = names.reduce((sum, name) => sum + (before[name] - (after[name] ?? 0)), 0);

	return [
		...names.map(
			(name) =>
				`${name.padEnd(width)}${formatBytes(before[name]).padStart(9)}  ->  ${formatBytes(after[name] ?? 0).padStart(9)}`,
		),
		'',
		`Reclaimed ${formatBytes(reclaimed)} across ${names.length} catalogs.`,
	].join('\n');
}
