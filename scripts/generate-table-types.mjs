#!/usr/bin/env node
/**
 * Writes `packages/db/src/tables.ts`: the Kysely database interface and one
 * interface per table.
 *
 * ```sh
 * pnpm generate:table-types   # rewrite the file
 * pnpm check:table-types      # fail if the checked-in file is not what this emits
 * ```
 *
 * The input is `packages/db/schema.sql`, the schema `pnpm db:migrate` dumps
 * after it applies the migrations. That file is the realised schema rather than
 * the migration text, which is the whole reason it is the input: parsing
 * `create table` blocks misses every `alter table ... add column`, and a check
 * that did exactly that shipped a real bug (#123). It also means a run needs no
 * database and no credentials, so the gate belongs in the `verify` job with the
 * other static checks.
 *
 * Two guards keep the chain honest. This script refuses to run when the
 * `schema_migrations` versions in the dump are not the migration filenames on
 * disk, which is the "you added a migration and never ran `pnpm db:migrate`"
 * case. `--check` refuses a checked-in `tables.ts` that differs from the dump,
 * which is the "you edited it by hand" case.
 *
 * Everything below is derived from the dump except three declarations, which
 * are things SQL does not say: `NOT_A_KYSELY_TABLE`, `TRIGGER_MAINTAINED`, and
 * `SimmerRole` coming from `packages/domain`. Each is commented where it sits.
 *
 * The emitted text is piped through Biome, so `pnpm check` and this agree on the
 * file byte for byte and `--check` can compare them directly.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = join(ROOT, 'packages/db/schema.sql');
const MIGRATIONS_DIR = join(ROOT, 'packages/db/migrations');
const OUT_FILE = join(ROOT, 'packages/db/src/tables.ts');
const CHECK = process.argv.includes('--check');

/**
 * Tables the database has and Kysely does not.
 *
 * `schema_migrations` is dbmate's own bookkeeping. `search_documents` is the
 * search index, written by triggers and read back through the raw SQL in
 * `packages/db/src/domains/search.ts`; giving it an interface would also give it
 * a row schema and a collection, because `generate-table-schemas.mjs` emits one
 * per interface, and the index is not sync surface.
 *
 * Anything else a migration creates gets an interface without being named here.
 */
const NOT_A_KYSELY_TABLE = new Set(['schema_migrations', 'search_documents']);

/**
 * Columns the `set_owned_centroid()` trigger writes.
 *
 * They are ordinary nullable columns in the catalog, so nothing in the dump says
 * a client must not supply one or that a row always has one. The trigger fires
 * `before insert or update of geom` on all fifteen geometry-owning tables and
 * derives all three from `geom`, which is `not null`, so a write that sets one
 * is overwritten and a row that omits one does not exist. That is what
 * `GeneratedColumn` says, and it only applies to a table that actually carries
 * the trigger.
 */
const TRIGGER_MAINTAINED = new Set(['lat', 'lng', 'geom_type']);

/** The trigger function whose presence turns {@link TRIGGER_MAINTAINED} on. */
const CENTROID_FUNCTION = 'public.set_owned_centroid()';

/**
 * The one enum the database and `packages/domain` both declare.
 *
 * The role ladder is domain vocabulary before it is a column, so `SimmerRole` is
 * declared once in `packages/domain` and re-exported here, which is what keeps
 * its ~15 importers naming it the same way. The emitted file asserts the two
 * still hold the same members, so adding a role in SQL alone fails `tsc`.
 */
const ROLE_ENUM = 'simmer_role';

// ---------------------------------------------------------------------------
// Reading the dump.
// ---------------------------------------------------------------------------

/** `('202605120001'),` in the `schema_migrations` insert dbmate appends. */
const DUMPED_VERSION = /^\s*\('(\d+)'\)[,;]$/gm;

/** A migration filename is `<version>_<name>.sql`. Anything else is not one. */
const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

/**
 * Fails when the dump is not the one the migrations on disk produce.
 *
 * Without this the whole chain reads a stale file and passes: a migration that
 * was written but never applied changes no column here, so `tables.ts` matches
 * the dump, the dump matches nothing, and the gate is green on a schema that
 * does not exist.
 */
function requireDumpMatchesMigrations(sql) {
	const dumped = [...sql.matchAll(DUMPED_VERSION)].map((match) => match[1]).sort();
	const onDisk = readdirSync(MIGRATIONS_DIR)
		.map((file) => MIGRATION_FILE.exec(file))
		.filter((match) => match !== null)
		.map((match) => match[1])
		.sort();

	const missing = onDisk.filter((version) => !dumped.includes(version));
	const extra = dumped.filter((version) => !onDisk.includes(version));

	if (missing.length === 0 && extra.length === 0) {
		return;
	}

	console.error('packages/db/schema.sql is not the schema these migrations produce.');
	for (const version of missing) {
		console.error(`  migration ${version} is on disk and not in the dump`);
	}
	for (const version of extra) {
		console.error(`  version ${version} is in the dump and no migration file names it`);
	}
	console.error('');
	console.error('Apply them and re-dump: pnpm db:migrate');
	process.exit(1);
}

/** `CREATE TYPE public.membership_status AS ENUM ('active', ...);` */
function readEnums(sql) {
	const enums = new Map();

	for (const match of sql.matchAll(/^CREATE TYPE public\.(\w+) AS ENUM \(\n([\s\S]*?)^\);$/gm)) {
		enums.set(
			match[1],
			[...match[2].matchAll(/'([^']*)'/g)].map((member) => member[1]),
		);
	}

	return enums;
}

/** The tables carrying a `set_owned_centroid()` trigger. */
function readCentroidTables(sql) {
	const tables = new Set();

	for (const match of sql.matchAll(/^CREATE TRIGGER \w+ [\s\S]*?ON public\.(\w+) [\s\S]*?;$/gm)) {
		if (match[0].includes(CENTROID_FUNCTION)) {
			tables.add(match[1]);
		}
	}

	return tables;
}

/**
 * One column of a `CREATE TABLE` body.
 *
 * pg_dump writes `<name> <type>[ DEFAULT <expr>][ GENERATED ALWAYS AS (<expr>)
 * STORED][ NOT NULL]`, one per line, and puts table constraints in the same
 * list.
 */
function readColumn(line) {
	const declaration = line.trim().replace(/,$/, '');

	if (declaration.startsWith('CONSTRAINT ')) {
		return null;
	}

	// pg_dump quotes a column whose name is a keyword, and three tables have a
	// `"position"`. Unquoted-only dropped all three, and the drift check is what
	// said so.
	const named = declaration.match(/^"?([a-z0-9_]+)"? (.+)$/);

	return named === null ? null : { column: named[1], ...readModifiers(named[2]) };
}

/**
 * The type and the suffixes after a column's name.
 *
 * They come off the end one at a time rather than through one pattern, because a
 * default expression can contain any of the words that follow it.
 */
function readModifiers(declaration) {
	const notNull = declaration.endsWith(' NOT NULL');
	const withoutNotNull = notNull ? declaration.slice(0, -' NOT NULL'.length) : declaration;

	const generated = withoutNotNull.match(/ GENERATED ALWAYS AS \((.*)\) STORED$/);
	const withoutGenerated = withoutNotNull.slice(0, generated?.index);

	const defaulted = withoutGenerated.match(/ DEFAULT .+$/);

	return {
		sqlType: withoutGenerated.slice(0, defaulted?.index).trim(),
		notNull,
		hasDefault: defaulted !== null,
		generatedFrom: generated?.[1] ?? null,
	};
}

function readTables(sql) {
	const tables = new Map();

	for (const match of sql.matchAll(/^CREATE TABLE public\.(\w+) \(\n([\s\S]*?)^\);$/gm)) {
		if (NOT_A_KYSELY_TABLE.has(match[1])) {
			continue;
		}

		tables.set(
			match[1],
			match[2]
				.split('\n')
				.map(readColumn)
				.filter((column) => column !== null),
		);
	}

	return tables;
}

// ---------------------------------------------------------------------------
// SQL types to TypeScript.
// ---------------------------------------------------------------------------

/**
 * What a column's TypeScript type is made of, before nullability and defaults.
 *
 * `kind` is what decides the wrapper, because the wrapper is not a function of
 * the TypeScript type: `date` and `timestamp with time zone` both read as `Date`
 * and are written differently, and `jsonb` and `geometry` each have one of their
 * own.
 */
const SQL_TYPES = [
	{
		match: /^(uuid|text|citext|character|character varying|character\(\d+\)|tsvector)$/,
		kind: 'scalar',
		ts: 'string',
	},
	{ match: /^character varying\(\d+\)$/, kind: 'scalar', ts: 'string' },
	{ match: /^text\[\]$/, kind: 'scalar', ts: 'string[]' },
	{ match: /^boolean$/, kind: 'boolean', ts: 'boolean' },
	{
		match: /^(smallint|integer|double precision|real|numeric|numeric\(\d+,\s*\d+\))$/,
		kind: 'scalar',
		ts: 'number',
	},
	{ match: /^jsonb?$/, kind: 'json', ts: 'unknown' },
	{ match: /^timestamp with time zone$/, kind: 'timestamp', ts: 'Date' },
	{ match: /^date$/, kind: 'date', ts: 'Date' },
	{ match: /^public\.geometry\(\w+,\d+\)$/, kind: 'geometry', ts: 'string' },
];

/** PascalCase, for both a table name and an enum type name. */
const toPascal = (name) => name.replace(/(^|_)([a-z0-9])/g, (_, __, char) => char.toUpperCase());

function baseTypeOf(table, { column, sqlType }, enums) {
	const enumName = sqlType.replace(/^public\./, '');

	if (enums.has(enumName)) {
		return { kind: 'enum', ts: toPascal(enumName) };
	}

	const known = SQL_TYPES.find((candidate) => candidate.match.test(sqlType));

	if (known) {
		return { kind: known.kind, ts: known.ts };
	}

	console.error(`No TypeScript type for ${table}.${column}, which is \`${sqlType}\`.`);
	console.error('Add it to SQL_TYPES in scripts/generate-table-types.mjs.');
	return process.exit(1);
}

/**
 * A column no write may set: a stored generated column, or one the centroid
 * trigger owns.
 *
 * `st_asgeojson(geom)` runs over a `not null` geom, so the value is always
 * there even though the catalog reports the column nullable.
 */
function databaseFilledType(table, column, base, centroidTables) {
	if (column.generatedFrom?.includes('st_asgeojson')) {
		return 'GeneratedColumn<GeoJsonGeometry>';
	}

	if (column.generatedFrom !== null) {
		return `GeneratedColumn<${base.ts}>`;
	}

	return TRIGGER_MAINTAINED.has(column.column) && centroidTables.has(table)
		? `GeneratedColumn<${base.ts}>`
		: null;
}

/** A `timestamp with time zone`, which reads three ways. */
function timestampType(column) {
	if (!column.notNull) {
		return 'NullableTimestampWithDefault';
	}

	return column.hasDefault ? 'TimestampWithDefault' : 'Date';
}

/**
 * The kinds with an alias of their own, where the alias says something a bare
 * union cannot. Each answers from the column, because nullability and a default
 * are part of what it encodes.
 */
const ALIASED_KINDS = {
	geometry: () => 'GeometryColumn',
	json: () => 'JsonColumn',
	timestamp: timestampType,
	date: (column) => (column.notNull ? 'DateColumn' : 'NullableDateColumn'),
};

/**
 * Everything else.
 *
 * A nullable column is written `T | null` rather than through a `ColumnType`,
 * because Kysely already makes a column whose insert type admits `null` optional
 * on insert.
 */
function unionType(column, base) {
	if (!column.notNull) {
		return `${base.ts} | null`;
	}

	if (!column.hasDefault) {
		return base.ts;
	}

	return base.kind === 'boolean' ? 'BooleanWithDefault' : `Generated<${base.ts}>`;
}

/** The type of one column. */
function columnType(table, column, enums, centroidTables) {
	const base = baseTypeOf(table, column, enums);

	return (
		databaseFilledType(table, column, base, centroidTables) ??
		ALIASED_KINDS[base.kind]?.(column) ??
		unionType(column, base)
	);
}

// ---------------------------------------------------------------------------
// Emitting.
// ---------------------------------------------------------------------------

/**
 * The aliases, in the order they are declared. `used` decides which are emitted,
 * because an alias nothing names is a lint error rather than a spare part.
 */
const ALIASES = [
	{
		name: 'TimestampWithDefault',
		text: 'type TimestampWithDefault = ColumnType<Date, Date | undefined, Date | undefined>;',
	},
	{
		name: 'NullableTimestampWithDefault',
		text: 'type NullableTimestampWithDefault = ColumnType<Date | null, Date | null | undefined, Date | null | undefined>;',
	},
	{
		name: 'BooleanWithDefault',
		text: 'type BooleanWithDefault = ColumnType<boolean, boolean | undefined, boolean>;',
	},
	{
		name: 'JsonColumn',
		text: 'type JsonColumn = ColumnType<unknown | null, unknown | null | undefined, unknown | null>;',
	},
	{
		name: 'GeneratedColumn',
		text: [
			'/** A column the database fills and no write may set: a stored generated column, or one a trigger owns. */',
			'type GeneratedColumn<T> = ColumnType<T, never, never>;',
		].join('\n'),
	},
	{
		name: 'DateColumn',
		text: [
			'/**',
			' * A SQL `date`, which is a calendar day and not an instant.',
			' *',
			' * It reaches a collection as the `YYYY-MM-DD` string Electric streams and',
			' * reaches Kysely as whatever the pg driver parses, so the two transports',
			' * genuinely differ and the drift check compares the column and not its type.',
			' */',
			'type DateColumn = ColumnType<Date, Date, Date>;',
		].join('\n'),
	},
	{
		name: 'NullableDateColumn',
		text: 'type NullableDateColumn = ColumnType<Date | null, Date | null | undefined, Date | null | undefined>;',
	},
	{
		name: 'GeometryColumn',
		text: [
			'/** PostGIS geometry. A write sends WKT or a `RawBuilder` around an `ST_` call. */',
			'type GeometryColumn = ColumnType<',
			'\tstring,',
			'\tstring | RawBuilder<string> | undefined,',
			'\tstring | RawBuilder<string> | undefined',
			'>;',
		].join('\n'),
	},
];

const HEADER = `/**
 * Every table in the database, as Kysely sees it.
 *
 * Generated by \`pnpm generate:table-types\` from \`packages/db/schema.sql\`, the
 * schema dbmate dumps when it applies the migrations. Do not edit it by hand:
 * \`pnpm check:table-types\` runs the generator and fails on any difference, so a
 * hand change is rejected by CI and overwritten by the next run.
 *
 * To change a type here, change the column. Write the migration, run
 * \`pnpm db:migrate\` so the dump moves with it, then \`pnpm generate:table-types\`.
 *
 * The row schemas in \`packages/sync\` are the client's half of the same columns,
 * and \`packages/sync/src/tests/unit/collections/tables/drift.test.ts\` holds them
 * to these interfaces at type level. It is generated too, by
 * \`pnpm generate:schemas\`.
 */`;

function emit(tables, enums, centroidTables) {
	const interfaces = [...tables]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([table, columns]) => {
			const lines = columns.map(
				(column) => `\t${column.column}: ${columnType(table, column, enums, centroidTables)};`,
			);

			return `export interface ${toPascal(table)}Table {\n${lines.join('\n')}\n}`;
		});

	// Which alias is emitted is read back out of the interfaces rather than
	// collected while writing them, because an alias nothing names is a lint error
	// rather than a spare part. `\b` keeps `Generated` from matching inside
	// `GeneratedColumn`.
	const names = interfaces.join('\n');
	const used = new Set(
		[...ALIASES.map((alias) => alias.name), 'Generated'].filter((name) =>
			new RegExp(`\\b${name}\\b`).test(names),
		),
	);

	const enumDeclarations = [...enums]
		.filter(([name]) => name !== ROLE_ENUM)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(
			([name, members]) =>
				`export type ${toPascal(name)} = ${members.map((member) => `'${member}'`).join(' | ')};`,
		);

	const imported = [
		'ColumnType',
		used.has('Generated') && 'Generated',
		used.has('GeometryColumn') && 'RawBuilder',
	]
		.filter(Boolean)
		.sort();

	const databaseEntries = [...tables.keys()]
		.sort()
		.map((table) => `\t${table}: ${toPascal(table)}Table;`);

	return [
		HEADER,
		'',
		`import type { SimmerRole } from '@simmer-mosquito/domain';`,
		`import type { ${imported.join(', ')} } from 'kysely';`,
		'',
		'export type { SimmerRole };',
		'',
		roleAssertion(enums),
		'',
		ALIASES.filter((alias) => used.has(alias.name))
			.map((alias) => alias.text)
			.join('\n'),
		'',
		enumDeclarations.join('\n'),
		'',
		'/** A GeoJSON geometry object, as `ST_AsGeoJSON` renders one. */',
		'export type GeoJsonGeometry = Record<string, unknown>;',
		'',
		interfaces.join('\n\n'),
		'',
		'/** The database Kysely is parameterised by. Every table, keyed by its SQL name. */',
		`export interface SimmerDatabase {\n${databaseEntries.join('\n')}\n}`,
		'',
	].join('\n');
}

/**
 * Holds `packages/domain`'s role ladder to the `simmer_role` enum.
 *
 * Without it the one enum this file imports rather than declares is the one
 * enum a migration could change unnoticed.
 */
function roleAssertion(enums) {
	const members = enums.get(ROLE_ENUM);

	if (!members) {
		console.error(`The dump has no \`${ROLE_ENUM}\` enum, so \`SimmerRole\` stands for nothing.`);
		process.exit(1);
	}

	return [
		'/**',
		' * Exact type identity, which a pair of `extends` cannot express: `A extends B,',
		' * B extends A` is a circular constraint, and a union compares by assignability',
		' * either way round.',
		' */',
		'type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2',
		'\t? true',
		'\t: false;',
		'',
		'/** Errors when `T` is not `true`. */',
		'type Assert<T extends true> = T;',
		'',
		'/**',
		' * The role ladder is declared in `packages/domain` and re-exported above, so a',
		' * migration that adds a role has to be matched there. This is what says so.',
		' */',
		`type _SimmerRoleMatchesDatabase = Assert<Equals<SimmerRole, ${members
			.map((member) => `'${member}'`)
			.join(' | ')}>>;`,
	].join('\n');
}

/**
 * Biome, over stdin.
 *
 * The file is gated byte for byte, so the generator has to emit what `pnpm check`
 * would leave behind rather than something a later `pnpm check:write` tidies into
 * a diff nobody asked for.
 */
function formatted(source) {
	// Through a shell, and by path: on Windows the workspace binary is a `.CMD`
	// shim that Node refuses to spawn directly, and it is not on PATH either way.
	const biome = spawnSync(
		`"${join(ROOT, 'node_modules/.bin/biome')}"`,
		['format', '--stdin-file-path=tables.ts'],
		{ cwd: ROOT, input: source, encoding: 'utf8', shell: true },
	);

	if (biome.status !== 0) {
		console.error('Biome could not format the generated file.');
		console.error(biome.stderr || biome.error?.message);
		process.exit(1);
	}

	return biome.stdout;
}

// ---------------------------------------------------------------------------

const sql = readFileSync(SCHEMA_FILE, 'utf8').replace(/\r\n/g, '\n');
requireDumpMatchesMigrations(sql);

const enums = readEnums(sql);
const tables = readTables(sql);
const source = formatted(emit(tables, enums, readCentroidTables(sql)));

if (!CHECK) {
	writeFileSync(OUT_FILE, source, 'utf8');
	console.log(`packages/db/src/tables.ts: ${tables.size} tables, ${enums.size} enums.`);
	process.exit(0);
}

const current = readFileSync(OUT_FILE, 'utf8').replace(/\r\n/g, '\n');

if (current === source) {
	console.log(`packages/db/src/tables.ts matches the migrations: ${tables.size} tables.`);
	process.exit(0);
}

console.error('packages/db/src/tables.ts is not what the migrations produce.');
console.error('');
for (const line of firstDifferences(current, source)) {
	console.error(line);
}
console.error('');
console.error('Regenerate it: pnpm generate:table-types');
process.exit(1);

/**
 * The first few differing lines, with their line numbers.
 *
 * A whole diff of a 1100-line file buries the answer; a count is not one at all.
 */
function firstDifferences(current, expected, limit = 20) {
	const left = current.split('\n');
	const right = expected.split('\n');
	const findings = [];

	for (let i = 0; i < Math.max(left.length, right.length) && findings.length < limit; i += 1) {
		if (left[i] !== right[i]) {
			findings.push(`  line ${i + 1}`);
			findings.push(`    checked in: ${left[i] ?? '(end of file)'}`);
			findings.push(`    migrations: ${right[i] ?? '(end of file)'}`);
		}
	}

	return findings;
}
