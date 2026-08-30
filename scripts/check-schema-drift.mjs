#!/usr/bin/env node
/**
 * Answers whether a live database is still the one `packages/db/migrations`
 * produces.
 *
 * The migration workflow covers the normal path: a push to `staging` touching
 * the migrations directory runs `dbmate up`, one file at a time. What nothing
 * covered is a migration applied by hand, a `dbmate` run that half-failed, or a
 * fix made straight on the database. This is that check.
 *
 * Two comparisons, both reads:
 *
 * 1. **The applied set.** `schema_migrations` on the observed database against
 *    the migration filenames in the repository. Catches a half-applied set, and
 *    a version applied that no file names.
 * 2. **The realised schema.** Tables, columns, indexes, constraints and triggers
 *    on the observed database against the same read taken from the expected one,
 *    which is a throwaway container with the migrations freshly applied.
 *
 * Comparison 2 reads the catalog, never the migration text. Parsing
 * `create table` blocks misses every `alter table ... add column`, which is how
 * a real drift bug got past a check in #123.
 *
 * Nothing here opens a writing transaction. Each session is set read only
 * before the first query, so a query that tried to write would error rather
 * than write. That is not fussiness: the observed database in CI is staging,
 * and a large write transaction against it is the #166 outage (#236).
 *
 *   node scripts/check-schema-drift.mjs \
 *     --observed postgres://... \
 *     --expected postgres://... \
 *     [--migrations-dir packages/db/migrations]
 *
 * Exits 0 when the two agree, 1 when they do not, and prints the objects that
 * differ by name. A count is not an answer.
 */

import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MIGRATIONS_DIR = join(workspaceRoot, 'packages/db/migrations');

/**
 * The two sides, as they are named in every line of output.
 *
 * `observed` is the database being questioned; `expected` is the one the
 * migration set just built. "only on expected" therefore reads as "the observed
 * database is missing this".
 */
const OBSERVED = 'observed';
const EXPECTED = 'expected';

/**
 * A migration filename is `<version>_<name>.sql` and dbmate stores the version
 * alone. Anything else in the directory is not a migration.
 */
const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

/** Every flag the script takes, and the field it fills. All three take a value. */
const FLAGS = {
	'--observed': 'observed',
	'--expected': 'expected',
	'--migrations-dir': 'migrationsDir',
};

function parseArgs(argv) {
	const args = { migrationsDir: DEFAULT_MIGRATIONS_DIR };

	for (let i = 0; i < argv.length; i += 2) {
		const field = FLAGS[argv[i]];

		if (!field || argv[i + 1] === undefined) {
			usage(`Expected a flag and a value, got: ${argv.slice(i).join(' ')}`);
		}

		args[field] = argv[i + 1];
	}

	requireBothUrls(args);
	args.migrationsDir = resolve(args.migrationsDir);
	return args;
}

function requireBothUrls(args) {
	if (!args.observed || !args.expected) {
		usage('Both --observed and --expected need a connection URL.');
	}
}

function usage(message) {
	console.error(message);
	console.error();
	console.error('Usage:');
	console.error('  node scripts/check-schema-drift.mjs \\');
	console.error('    --observed <connection url> \\');
	console.error('    --expected <connection url> \\');
	console.error('    [--migrations-dir packages/db/migrations]');
	process.exit(2);
}

/**
 * Opens a read-only session.
 *
 * The read-only characteristic is the guard that keeps this script safe to
 * point at staging. Both comparisons are reads already, so it enforces a
 * property rather than creating one, but it is the property the whole job
 * exists under.
 */
async function connectReadOnly(connectionString) {
	const client = new pg.Client({ connectionString });
	await client.connect();
	await client.query('set session characteristics as transaction read only');
	return client;
}

/**
 * What the catalog is read for, and how each row is keyed and rendered.
 *
 * One query per object kind rather than one union, because the key and the
 * comparable value differ per kind and a union would have to flatten both into
 * text before the script could tell a rename from a redefinition.
 *
 * Columns come from `information_schema`. Indexes, constraints and triggers have
 * no `information_schema` view that carries a definition, so they come from
 * `pg_catalog` through the `pg_get_*def` functions, which render the object as
 * the server holds it. Neither reads a migration file.
 */
/**
 * `information_schema` reports an attribute that does not apply to a type as
 * null. Rendering it as a word keeps the two sides comparable as text and keeps
 * a null out of the report.
 */
const orNone = (attribute) => attribute ?? 'none';

const OBJECT_KINDS = [
	{
		name: 'table',
		plural: 'tables',
		sql: `
			select table_name
			from information_schema.tables
			where table_schema = 'public' and table_type = 'BASE TABLE'
		`,
		key: (row) => row.table_name,
		value: () => '',
	},
	{
		name: 'column',
		plural: 'columns',
		sql: `
			select
				table_name,
				column_name,
				data_type,
				udt_name,
				is_nullable,
				column_default,
				character_maximum_length,
				numeric_precision,
				numeric_scale,
				datetime_precision
			from information_schema.columns
			where table_schema = 'public'
		`,
		key: (row) => `${row.table_name}.${row.column_name}`,
		value: (row) =>
			[
				row.data_type,
				row.udt_name,
				`nullable=${row.is_nullable}`,
				`default=${orNone(row.column_default)}`,
				`length=${orNone(row.character_maximum_length)}`,
				`precision=${orNone(row.numeric_precision)}`,
				`scale=${orNone(row.numeric_scale)}`,
				`datetime_precision=${orNone(row.datetime_precision)}`,
			].join(' '),
	},
	{
		name: 'index',
		plural: 'indexes',
		sql: `
			select tablename, indexname, indexdef
			from pg_indexes
			where schemaname = 'public'
		`,
		key: (row) => `${row.tablename}.${row.indexname}`,
		value: (row) => row.indexdef,
	},
	{
		name: 'constraint',
		plural: 'constraints',
		sql: `
			select rel.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as definition
			from pg_constraint con
			join pg_class rel on rel.oid = con.conrelid
			join pg_namespace nsp on nsp.oid = rel.relnamespace
			where nsp.nspname = 'public'
		`,
		key: (row) => `${row.table_name}.${row.conname}`,
		value: (row) => row.definition,
	},
	{
		// `tgisinternal` triggers are the ones a foreign key installs to enforce
		// itself. They are the constraint restated, so counting them here would
		// report every foreign-key difference twice.
		name: 'trigger',
		plural: 'triggers',
		sql: `
			select rel.relname as table_name, tg.tgname, pg_get_triggerdef(tg.oid) as definition
			from pg_trigger tg
			join pg_class rel on rel.oid = tg.tgrelid
			join pg_namespace nsp on nsp.oid = rel.relnamespace
			where nsp.nspname = 'public' and not tg.tgisinternal
		`,
		key: (row) => `${row.table_name}.${row.tgname}`,
		value: (row) => row.definition,
	},
];

async function readObjects(client) {
	const objects = new Map();

	for (const kind of OBJECT_KINDS) {
		const { rows } = await client.query(kind.sql);
		const entries = new Map();

		for (const row of rows) {
			entries.set(kind.key(row), kind.value(row));
		}

		objects.set(kind.name, entries);
	}

	return objects;
}

async function readAppliedVersions(client) {
	const { rows } = await client.query('select version from schema_migrations order by version');
	return rows.map((row) => String(row.version));
}

function readMigrationVersions(migrationsDir) {
	return readdirSync(migrationsDir)
		.map((file) => MIGRATION_FILE.exec(file))
		.filter((match) => match !== null)
		.map((match) => ({ version: match[1], file: match[0] }))
		.sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Names what is on one side and not the other, and what is on both under the
 * same name with a different definition.
 */
function compare(kindName, observed, expected) {
	return [
		...onlyOn(kindName, observed, expected, OBSERVED, EXPECTED),
		...onlyOn(kindName, expected, observed, EXPECTED, OBSERVED),
		...differing(kindName, observed, expected),
	].sort();
}

function onlyOn(kindName, present, absent, presentSide, absentSide) {
	const findings = [];

	for (const key of present.keys()) {
		if (!absent.has(key)) {
			findings.push(`${kindName} ${key} exists on ${presentSide} and not on ${absentSide}`);
		}
	}

	return findings;
}

function differing(kindName, observed, expected) {
	const findings = [];

	for (const [key, value] of observed) {
		const other = expected.get(key);

		if (other !== undefined && other !== value) {
			findings.push(
				[
					`${kindName} ${key} is defined differently on the two sides`,
					`  ${OBSERVED}: ${value}`,
					`  ${EXPECTED}: ${other}`,
				].join('\n'),
			);
		}
	}

	return findings;
}

/**
 * Comparison 1: the applied set, against the repository.
 *
 * A version recorded with no file is a migration applied from somewhere other
 * than this branch. A file with no version is one that never ran.
 */
function compareAppliedSet(applied, files, migrationsDir) {
	const known = new Set(files.map((file) => file.version));

	return [
		...[...applied]
			.sort()
			.filter((version) => !known.has(version))
			.map(
				(version) =>
					`migration ${version} is recorded in schema_migrations on ${OBSERVED} and no file in ${migrationsDir} names it`,
			),
		...files
			.filter((file) => !applied.has(file.version))
			.map(
				(file) =>
					`migration ${file.file} is in the repository and is not recorded in schema_migrations on ${OBSERVED}`,
			),
	];
}

/**
 * Comparison 2: the realised schema, catalog against catalog.
 */
function compareSchemas(observedObjects, expectedObjects) {
	return OBJECT_KINDS.flatMap((kind) =>
		compare(kind.name, observedObjects.get(kind.name), expectedObjects.get(kind.name)),
	);
}

/**
 * The expected side is only worth comparing against if it really did apply the
 * whole set. A container whose migrations half-failed would otherwise report
 * every table it never reached as drift on the observed database, which is the
 * wrong answer given loudly.
 */
function requireCompleteExpected(expectedApplied, files) {
	const missing = files.filter((file) => !expectedApplied.has(file.version));

	if (missing.length === 0) {
		return;
	}

	console.error(
		`The ${EXPECTED} database has not applied the whole migration set, so it cannot stand for it.`,
	);
	for (const file of missing) {
		console.error(`  not applied: ${file.file}`);
	}
	process.exit(2);
}

function report(findings, files, expectedObjects) {
	if (findings.length === 0) {
		const counted = OBJECT_KINDS.map(
			(kind) => `${expectedObjects.get(kind.name).size} ${kind.plural}`,
		).join(', ');

		console.log(`The ${OBSERVED} database matches the schema ${files.length} migrations produce.`);
		console.log(`Compared: ${counted}.`);
		return;
	}

	console.log(`The ${OBSERVED} database has drifted from the migration set.`);
	console.log();
	for (const finding of findings) {
		console.log(finding);
	}
	process.exitCode = 1;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const files = readMigrationVersions(args.migrationsDir);

	if (files.length === 0) {
		// A directory that parses to nothing would make every comparison pass
		// over an empty set, which is the one failure mode a check like this has.
		console.error(`No migration files found in ${args.migrationsDir}.`);
		process.exit(2);
	}

	const observed = await connectReadOnly(args.observed);
	const expected = await connectReadOnly(args.expected);

	try {
		const applied = new Set(await readAppliedVersions(observed));
		const findings = compareAppliedSet(applied, files, args.migrationsDir);

		requireCompleteExpected(new Set(await readAppliedVersions(expected)), files);

		const observedObjects = await readObjects(observed);
		const expectedObjects = await readObjects(expected);

		findings.push(...compareSchemas(observedObjects, expectedObjects));
		report(findings, files, expectedObjects);
	} finally {
		await observed.end();
		await expected.end();
	}
}

await main();
