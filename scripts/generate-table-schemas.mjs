#!/usr/bin/env node
/**
 * Writes, per table, a zod schema into `packages/sync/src/collections/tables` and
 * a collection factory into `packages/sync/src/collections` — plus the barrel over
 * the factories and the type-level drift check that holds the schemas to the
 * database.
 *
 * Run it when a migration adds or changes a table, then own the output by hand —
 * a schema is where a table's client-side decisions live (which enum a column
 * really is, which shape its metadata takes). Running it again does not undo
 * them: a row schema that already exists has fields added and removed in place,
 * so the order, the prose and the expression beside each column survive.
 *
 * The one decision that must *not* be owned by hand is which columns a client
 * never receives, because a regeneration would put them back. `OMIT` below and
 * `WITHHELD` in `withheld-columns.mjs` are where that is said, and both the
 * schema and the drift check are generated from them together.
 *
 * The collection files are a different matter: every one of them is the same six
 * lines with a table name substituted, because everything a table can differ by is
 * either in its schema or declared by the client calling the factory. Editing one
 * by hand is a signal that something belongs in `functions/sync-collection.ts`.
 * The same goes for the two barrels and the drift suite, which are emitted whole.
 *
 * It reads two sources. `packages/db/src/tables.ts` gives the columns and their
 * TypeScript types. The migrations give which tables exist and which columns are
 * genuinely `uuid` — the TS type is `string` for both a uuid and a WorkOS id,
 * and `workos_user_id` is text.
 *
 * ```sh
 * pnpm generate:schemas          # dry run: reports what it would emit
 * pnpm generate:schemas --write  # write the files
 * pnpm check:schemas             # fail if the checked-in files are not what this emits
 * ```
 *
 * ## `--check`, and the two kinds of ownership
 *
 * `check:table-types` can compare its one file byte for byte because nothing in
 * it is anybody's to edit. Here, two of the five outputs are and three are not,
 * so the gate asks a different question of each.
 *
 * The collection factories, the two barrels and the drift suite are **generated**.
 * They are compared byte for byte, which is what caught the barrel's list of
 * `functions/` modules sitting one short: `session-fetch.ts` shipped in #298 and
 * was exported by hand, so every regeneration since would have dropped it.
 *
 * A row schema is **scaffolded**. Which columns are in it is this script's
 * decision, taken from `tables.ts`, `OMIT` and `WITHHELD`; the zod expression
 * against each column, the order, and the prose are a person's. So the gate
 * compares the field names as a set and nothing else. That is the whole of what
 * withholding is, and it is why deleting a `WITHHELD` entry now fails here as
 * well as at the floor in `withheld-columns.mjs`.
 *
 * Everything emitted goes through Biome first, so the two sides are compared on
 * the same footing and `pnpm generate:schemas --write` leaves nothing for a later
 * `pnpm check:write` to tidy into a diff nobody asked for.
 *
 * It is regex over TypeScript, so it is exactly as robust as that sounds. The
 * drift check is the backstop, and it has already caught this script dropping
 * columns with digits in their names, dropping columns whose type spans lines,
 * and resolving an `extends` clause to nothing.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WITHHELD, withheldColumnsFor } from './withheld-columns.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTIONS = join(ROOT, 'packages/sync/src/collections');
const OUT = join(COLLECTIONS, 'tables');
const WRITE = process.argv.includes('--write');
const CHECK = process.argv.includes('--check');

/**
 * Everything this run produces, with who owns each file.
 *
 * `generated` is emitted whole and compared byte for byte. `scaffolded` is a row
 * schema: the generator decides which columns are in it and a person decides
 * everything else, so only the field list is compared. See `--check` below.
 */
const artifacts = [];

const tablesSrc = readFileSync(join(ROOT, 'packages/db/src/tables.ts'), 'utf8');

// ---------------------------------------------------------------------------
// The migrations are the source of truth. Two things are read from them: which
// tables exist, and which columns are really `uuid` — the TS type is `string`
// for both a uuid and a WorkOS id, and `workos_user_id` is text.
// ---------------------------------------------------------------------------
const realTables = new Set();
const uuidColumns = new Set();
const textColumns = new Set();

for (const file of readdirSync(join(ROOT, 'packages/db/migrations'))) {
	const sql = readFileSync(join(ROOT, 'packages/db/migrations', file), 'utf8');
	for (const m of sql.matchAll(/create table(?: if not exists)?\s+([a-z_]+)/gi)) {
		realTables.add(m[1]);
	}
	for (const m of sql.matchAll(/^\s*([a-z_]+)\s+uuid\b/gim)) uuidColumns.add(m[1]);
	for (const m of sql.matchAll(/^\s*([a-z_]+)\s+(?:text|varchar|citext)\b/gim))
		textColumns.add(m[1]);
}
// A name used for both is not safe to assume.
for (const name of textColumns) uuidColumns.delete(name);

// ---------------------------------------------------------------------------
// The enum types come from `packages/domain`, not from `tables.ts`.
//
// This used to regex `export type X = 'a' | 'b';` out of `tables.ts`, which
// worked until a type moved to the domain: an imported type is invisible to that
// pattern, so the generator printed `UNMAPPED memberships: role: SimmerRole` and
// emitted no field for the column. `SimmerRole` sat hand-typed and ungenerated
// for that reason, and #432 moved the other sixteen the same way. Reading the
// register instead means a type's home does not decide whether a column gets a
// schema.
//
// `packages/sync` cannot import `packages/domain` (ADR 0007), so the members are
// copied into the emitted `z.enum`. That copy is generated rather than written,
// and `pnpm check:column-vocabularies` holds it to the register, ordered.
// ---------------------------------------------------------------------------
const registerSrc = readFileSync(
	join(ROOT, 'packages/domain/src/column-vocabularies.ts'),
	'utf8',
).replace(/\r\n/g, '\n');

const enums = new Map();
{
	const members = new Map(
		[...registerSrc.matchAll(/^export const ([A-Z0-9_]+) = (\[[^\]]*\]) as const;$/gm)].map((m) => [
			m[1],
			[...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]),
		]),
	);
	for (const m of registerSrc.matchAll(
		/^export type (\w+) = \(typeof ([A-Z0-9_]+)\)\[number\];$/gm,
	)) {
		const declared = members.get(m[2]);
		if (declared !== undefined) enums.set(m[1], declared);
	}
}

// ---------------------------------------------------------------------------
// Interfaces, including the ones that extend a shared base.
// ---------------------------------------------------------------------------
const bodies = new Map();
for (const m of tablesSrc.matchAll(
	/(?:export )?interface (\w+?)(?:Table)? ?(?:extends (\w+))? \{\n?([\s\S]*?)\n?\}/g,
)) {
	bodies.set(m[1], { extends: m[2], body: m[3] ?? '' });
}

function columnsOf(name, seen = new Set()) {
	// Interfaces are registered without their `Table` suffix, but an `extends`
	// clause names them with it. `SourceReductionMethodsTable extends
	// InterventionMethodTable` resolved to nothing until this looked both ways.
	const entry = bodies.get(name) ?? bodies.get(name.replace(/Table$/, ''));
	if (!entry || seen.has(name)) return [];
	seen.add(name);

	const inherited = entry.extends ? columnsOf(entry.extends, seen) : [];
	const own = [];
	// A column whose type spans lines — `ColumnType<\n\t\tA,\n\t\tB\n\t>;` — is
	// joined back onto one line first. Continuation lines are indented deeper than
	// the one tab a column declaration starts with.
	const flattened = entry.body
		.replace(/\n\t\t+/g, ' ')
		.replace(/\n\t>/g, ' >')
		.replace(/ +/g, ' ');
	for (const line of flattened.split('\n')) {
		// Digits are part of a column name: `address_line_1`.
		const m = line.match(/^\t([a-z0-9_]+): (.+);$/);
		if (m) own.push({ column: m[1], tsType: m[2].trim() });
	}
	return [...inherited, ...own];
}

/**
 * Names the simple rule gets wrong. `Species` is both singular and plural, and a
 * row of `genera` is a `Genus`.
 *
 * `Collections` is not an irregular plural — it is a collision. A row of the
 * `collections` table is a Collection in the domain sense (what a trap caught),
 * but `Collection` is also what TanStack DB calls the thing that holds rows, so
 * a module naming both cannot import them. `AdultCollection` is the qualifier
 * the surrounding code already uses, and the domain word survives inside it.
 */
const IRREGULAR = {
	Collections: 'AdultCollection',
	Addresses: 'Address',
	CollectionSpecies: 'CollectionSpecies',
	Genera: 'Genus',
	OrganizationSpecies: 'OrganizationSpecies',
	SampleSpecies: 'SampleSpecies',
	Species: 'Species',
	AdditionalPersonnel: 'AdditionalPersonnel',
	Equipment: 'Equipment',
};

const toSnake = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Columns no client receives, on any table. */
const OMIT = new Set(['geom', 'geojson', 'deleted_at', 'deleted_by_profile_id']);

const withheldColumns = withheldColumnsFor;

/**
 * Reflows a reason into the ` * `-prefixed lines of a JSDoc block.
 *
 * Greedy: take as much as fits, ending on a word boundary. Biome will not do it —
 * a comment is opaque to a formatter — so an unwrapped reason would emit one very
 * long line and stay that way.
 */
function wrapComment(text) {
	return (text.match(/\S.{0,73}(?=\s|$)/g) ?? []).join('\n * ');
}
const AUDIT = new Set([
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
]);

function zodFor(column, tsType) {
	const nullable = /\|\s*null/.test(tsType);
	let bare = tsType.replace(/\s*\|\s*null/g, '').trim();
	const inline = bare.match(/^ColumnType<\s*([A-Za-z<>]+)\s*,/);
	if (inline) bare = inline[1];

	// `Generated<T>` is a column with a database default. A client still receives
	// a plain `T`, so only the wrapper is dropped. `Generated<string>` is left to
	// the branch below, because a uuid column reads as one and `string` does not.
	const generated = bare.match(/^Generated<(\w+)>$/);
	if (generated && enums.has(generated[1])) bare = generated[1];

	const stringBase = uuidColumns.has(column) || column === 'id' ? 'z.uuid()' : 'z.string()';
	let base;

	if (bare === 'Generated<string>') base = stringBase;
	else if (bare === 'TimestampWithDefault' || bare === 'NullableTimestampWithDefault')
		base = 'z.coerce.date()';
	else if (bare === 'DateColumn' || bare === 'NullableDateColumn') base = 'z.string()';
	else if (bare === 'BooleanWithDefault' || bare === 'boolean') base = 'z.boolean()';
	else if (bare === 'JsonColumn' || bare === 'unknown') base = 'z.unknown()';
	else if (bare === 'number' || bare === 'GeneratedColumn<number>') base = 'z.number()';
	else if (bare === 'Date') base = 'z.coerce.date()';
	else if (bare === 'string' || bare === 'GeneratedColumn<string>') base = stringBase;
	else if (enums.has(bare))
		base = `z.enum([${enums
			.get(bare)
			.map((v) => `'${v}'`)
			.join(', ')}])`;
	else return { zod: null, unknownType: bare };

	let out = base;
	if (bare === 'JsonColumn' || bare === 'unknown') out = 'z.unknown().nullable()';
	else if (nullable || bare.startsWith('Nullable')) out = `${base}.nullable()`;

	if (AUDIT.has(column)) {
		out += column.endsWith('_at') ? '.default(() => new Date())' : '.default(null)';
	}
	return { zod: out, unknownType: null };
}

const report = [];
const emitted = [];

for (const [name] of bodies) {
	const table = toSnake(name);
	if (!realTables.has(table)) continue;

	const withheld = withheldColumns(table);
	const lines = [];
	const unknown = [];
	const wireDates = [];
	for (const { column, tsType } of columnsOf(name)) {
		if (OMIT.has(column) || withheld.has(column)) continue;
		const { zod, unknownType } = zodFor(column, tsType);
		if (zod === null) unknown.push(`${column}: ${unknownType}`);
		else lines.push(`\t${column}: ${zod},`);
		if (/^(DateColumn|NullableDateColumn)$/.test(tsType.trim())) wireDates.push(column);
	}
	if (unknown.length) report.push(`UNMAPPED ${table}: ${unknown.join(' | ')}`);

	// Named in the file that withholds them, so the absence is legible where a
	// reader would otherwise only notice a column missing.
	const withholdingNote =
		withheld.size === 0
			? ''
			: `\n * ${wrapComment(
					`This table withholds ${[...withheld].map((c) => `\`${c}\``).join(', ')} as well. ` +
						`They are ${WITHHELD[table].reason}. Say so in \`WITHHELD\` in ` +
						'`scripts/withheld-columns.mjs`, never by deleting a line below: ' +
						'`pnpm check:schemas` refuses a field list that is not the one that file ' +
						'generates, and the drift check reads the same list.',
				)}\n *`;

	// `Summaries` -> `Summary`, then `Batches` -> `Batch` (a plural in `-es` after a
	// sibilant keeps the whole `es`), then the ordinary trailing `s`.
	const singular =
		IRREGULAR[name] ??
		name
			.replace(/ies$/, 'y')
			.replace(/(ch|sh|ss|x|z)es$/, '$1')
			.replace(/([^s])s$/, '$1');
	const schemaName = `${singular[0].toLowerCase()}${singular.slice(1)}Schema`;
	const factoryName = `create${name}Collection`;
	const shapePathName = `${name[0].toLowerCase()}${name.slice(1)}ShapePath`;

	emitted.push({
		table,
		name,
		schemaName,
		typeName: singular,
		factoryName,
		shapePathName,
		wireDates,
	});

	const file = `/**
 * The \`${table}\` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * \`geom\`, \`geojson\`, \`deleted_at\` and \`deleted_by_profile_id\` are absent:
 * geometry is served by the \`/map/*\` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *${withholdingNote}
 * A \`date\` column is a \`YYYY-MM-DD\` string rather than a \`Date\` — see
 * \`functions/sync-collection.ts\` for why parsing one loses a day.
 */

import { z } from 'zod';

export const ${schemaName} = z.object({
${lines.join('\n')}
});

export type ${singular} = z.infer<typeof ${schemaName}>;
`;
	artifacts.push({ path: join(OUT, `${table}.ts`), source: file, ownership: 'scaffolded' });

	const collection = `/**
 * The \`${table}\` collection.
 *
 * Generated, and there is nothing table-specific below the schema import: what one
 * table differs by is either declared in its schema or chosen by the client
 * calling this. See \`functions/sync-collection.ts\` for what is shared, and
 * \`pnpm generate:schemas\` before editing this by hand.
 */

import { createCollection } from '@tanstack/db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { shapePathFor } from './functions/routes.js';
import {
	type SyncCollectionClientOptions,
	syncCollectionConfig,
} from './functions/sync-collection.js';
import { type ${singular}, ${schemaName} } from './tables/${table}.js';

/**
 * The row, re-exported here so a consumer needs one import rather than reaching
 * past the collection into the schema module for the type of what it holds.
 */
export type { ${singular} };

/** Where this table's shape is served. Derived so client and server cannot drift. */
export const ${shapePathName} = shapePathFor('${table}');

export function ${factoryName}(options: SyncCollectionClientOptions) {
	// The schema is passed here rather than through \`syncCollectionConfig\` because it
	// has to be concrete for the row type to be inferred from it — see that module.
	return createCollection(
		electricCollectionOptions({
			...syncCollectionConfig<${singular}>({ table: '${table}', ...options }),
			schema: ${schemaName},
		}),
	);
}
`;
	artifacts.push({
		path: join(COLLECTIONS, `${table}.ts`),
		source: collection,
		ownership: 'generated',
	});
}

// ---------------------------------------------------------------------------
// The drift check, as one type-level test.
// ---------------------------------------------------------------------------
const imports = emitted
	.map((e) => `import type { ${e.typeName} } from '../../../../collections/tables/${e.table}.js';`)
	.sort()
	.join('\n');

const union = (columns) => columns.map((column) => `'${column}'`).join(' | ');

const cases = emitted
	.map((e) => {
		const withheld = [...withheldColumns(e.table)];
		// A trailing `never` is only written when the argument after it is, because
		// the arguments are positional and the second one is the rarer of the two.
		const args =
			e.wireDates.length > 0
				? `, ${withheld.length > 0 ? union(withheld) : 'never'}, ${union(e.wireDates)}`
				: withheld.length > 0
					? `, ${union(withheld)}`
					: '';

		return `type ${e.typeName}Drift = Drift<${e.typeName}, ${e.name}Table${args}>;
type _${e.typeName} = Assert<${e.typeName}Drift>;`;
	})
	.join('\n');

const checkedTables = emitted
	.map((e) => `\t'${e.table}',`)
	.sort()
	.join('\n');

// `SelectType` sits in this import because it comes from the same package, and
// in the sorted list because Biome would move it there anyway.
const tableImports = [...emitted.map((e) => `\t${e.name}Table,`), '\tSelectType,']
	.sort()
	.join('\n');

const driftTest = `import { describe, expect, it } from 'vitest';
import type {
${tableImports}
} from '@simmer-mosquito/db';
import { tableSchemas } from '../../../../collections/tables/index.js';
${imports}

/**
 * Drift between a collection schema and the database.
 *
 * Most of it fails \`tsc\`, not the runner. A column added to a table in a
 * migration, renamed, dropped, or given a different type shows up here as a build
 * error naming the column, rather than as a row that silently arrives with a field
 * no schema knows about or a field whose type is a lie.
 *
 * The one runtime test is the one thing \`tsc\` cannot say: that every table with a
 * row schema has a pair below. A hand-written schema module with no pair used to
 * be a table nothing checked at all.
 *
 * Generated by \`pnpm generate:schemas\`.
 */

/** Columns no client receives, on any table, so their absence is correct. */
type ClientOmitted = 'geom' | 'geojson' | 'deleted_at' | 'deleted_by_profile_id';

/**
 * Exact type identity.
 *
 * Assignability is the wrong question in both directions: a schema that dropped
 * an enum member still assigns to the column, and one that gained a member is
 * still assignable from it.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
	? true
	: false;

/**
 * A key in the table that no schema field covers, or the reverse.
 *
 * \`TWithheld\` is what one table keeps from its readers, passed at the call sites
 * below and declared in \`WITHHELD\` in \`scripts/withheld-columns.mjs\`, which
 * generates both this file and the schema the column is missing from. It is
 * constrained to \`keyof TTable\`, so withholding a column a migration has since
 * renamed or dropped is an error here rather than a line that quietly withholds
 * nothing.
 */
type MissingColumns<TSchema, TTable, TWithheld extends keyof TTable> =
	| Exclude<keyof TTable, keyof TSchema | ClientOmitted | TWithheld>
	| Exclude<keyof TSchema, keyof TTable>;

/**
 * A column both sides carry whose type they disagree about.
 *
 * \`SelectType\` is the half of a \`ColumnType\` a read yields, which is the half a
 * client sees. Comparing the key union alone passed a column that went nullable,
 * gained an enum member, or changed from \`text\` to \`integer\`.
 *
 * \`TWireDate\` is the columns that are a SQL \`date\`. They reach a collection as
 * the \`YYYY-MM-DD\` string Electric streams and reach Kysely as whatever the pg
 * driver parses, so the two transports genuinely differ and only the column is
 * compared.
 */
type ChangedColumns<TSchema, TTable, TWireDate> = {
	[K in Extract<keyof TSchema, keyof TTable>]: K extends TWireDate
		? never
		: Equals<TSchema[K], SelectType<TTable[K]>> extends true
			? never
			: K;
}[Extract<keyof TSchema, keyof TTable>];

type Drift<
	TSchema,
	TTable,
	TWithheld extends keyof TTable = never,
	TWireDate extends keyof TSchema & keyof TTable = never,
> = MissingColumns<TSchema, TTable, TWithheld> | ChangedColumns<TSchema, TTable, TWireDate>;

/** Errors with the offending column names when \`T\` is not \`never\`. */
type Assert<T extends never> = T;

${cases}

/** The tables with a pair above, which is meant to be every table with a schema. */
const CHECKED_TABLES = [
${checkedTables}
];

describe('collection schemas against the database', () => {
	it('is checked by tsc rather than by the runner', () => {
		// Every assertion above is a type. This keeps the file a valid suite.
		expect(true).toBe(true);
	});

	it('pairs every row schema with a table type', () => {
		// Against the registry rather than the directory, because the registry is
		// what the server reads columns out of. A schema in it and not here is a
		// table streaming to clients with nothing holding it to the database.
		expect([...CHECKED_TABLES].sort()).toEqual(Object.keys(tableSchemas).sort());
	});
});
`;

// ---------------------------------------------------------------------------
// The schema registry, keyed by table.
// ---------------------------------------------------------------------------
const schemaImports = emitted
	.map((e) => `import { ${e.schemaName} } from './${e.table}.js';`)
	.sort()
	.join('\n');

const schemaEntries = emitted
	.map((e) => `\t${e.table}: ${e.schemaName},`)
	.sort()
	.join('\n');

const schemaRegistry = `/**
 * Every table's schema, reachable by table name.
 *
 * The server registers a shape route per table and has to force that route's
 * column list upstream. Those columns are \`Object.keys\` of the schema, so this
 * is what lets it read them without a second list to keep in step — the schema
 * decides both what a client parses and what the shape is allowed to carry.
 *
 * Keyed by the Postgres table name rather than exported one by one, because the
 * server iterates rather than naming tables.
 *
 * Generated by \`pnpm generate:schemas\`.
 */

${schemaImports}

export const tableSchemas = {
${schemaEntries}
} as const;

/** A table with a collection. Every key of {@link tableSchemas}. */
export type SyncedTable = keyof typeof tableSchemas;
`;

// ---------------------------------------------------------------------------
// The barrel over the collection factories.
// ---------------------------------------------------------------------------
const barrel = `/**
 * Every synced table, as a collection factory.
 *
 * Calling one is what a client does to obtain a collection; nothing is created by
 * importing this. Which tables an app actually creates, how each syncs, and
 * whether each accepts writes are the app's decisions — this package holds no
 * opinion about any of them, and none of them are recorded here.
 *
 * Field names are the Postgres column names, unchanged. Electric already streams
 * snake_case (the server forces the column list upstream), so leaving it alone
 * means no \`columnMapper\`, and the predicates a live query pushes down as subset
 * requests compile to SQL that needs no identifier rewriting.
 *
 * Six modules from \`functions/\` are exported alongside them, because a caller
 * cannot use a factory without them: the options each one takes, the two wrappers
 * that name a write's command, the refusal a rejected write throws, the route
 * derivation the server registers against, and the hook an app installs so a
 * request refused for a stale session is renewed once and asked again. The rest
 * of \`functions/\` is how the factories are built and is nobody else's business.
 *
 * Generated by \`pnpm generate:schemas\`. Biome sorts the exports below, so the
 * six are somewhere in the middle of the list rather than at the top.
 */

export * from './functions/command-transaction.js';
export * from './functions/mutate-collection.js';
export * from './functions/routes.js';
export * from './functions/session-fetch.js';
export * from './functions/sync-collection.js';
export * from './functions/write-command.js';

export * from './tables/index.js';

${emitted
	.map((e) => `export * from './${e.table}.js';`)
	.sort()
	.join('\n')}
`;

artifacts.push(
	{ path: join(COLLECTIONS, 'index.ts'), source: barrel, ownership: 'generated' },
	{ path: join(OUT, 'index.ts'), source: schemaRegistry, ownership: 'generated' },
	{
		path: join(ROOT, 'packages/sync/src/tests/unit/collections/tables/drift.test.ts'),
		source: driftTest,
		ownership: 'generated',
	},
);

// ---------------------------------------------------------------------------
// Formatting, then either writing or checking.
// ---------------------------------------------------------------------------

/**
 * Biome, over stdin, on one emitted file.
 *
 * `check --write` rather than `format`, because the import and export ordering is
 * an assist action and not a formatter rule, and half of what a hand-written file
 * would differ by is that ordering.
 *
 * The path goes with the content so Biome resolves the same configuration it
 * would on the real file. Through a shell and by path: on Windows the workspace
 * binary is a `.CMD` shim that Node refuses to spawn directly, and it is not on
 * PATH either way.
 */
function formatted(source, path) {
	const biome = spawnSync(
		`"${join(ROOT, 'node_modules/.bin/biome')}"`,
		['check', '--write', `--stdin-file-path=${relative(ROOT, path).replace(/\\/g, '/')}`],
		{ cwd: ROOT, input: source, encoding: 'utf8', shell: true },
	);

	if (biome.status !== 0) {
		console.error(`Biome could not format ${relative(ROOT, path)}.`);
		console.error(biome.stderr || biome.error?.message);
		process.exit(1);
	}

	return biome.stdout;
}

/** The field a schema line names, or `null` when it names none. */
const fieldOf = (line) => line.match(/^\t([a-z0-9_]+):/)?.[1] ?? null;

/**
 * The one `z.object` in a row schema, as its body lines and the field each names.
 *
 * Every row schema this script has ever written is flat, so a field is a line
 * indented by exactly one tab. Reading the names rather than the text is what
 * lets the zod expression beside each one stay a person's to choose.
 */
function schemaBody(source) {
	const text = source.replace(/\r\n/g, '\n');
	const match = text.match(/(z\.object\(\{\n)([\s\S]*?)(\n\}\);)/);
	if (!match) return null;

	const lines = match[2].split('\n');
	return {
		text,
		lines,
		fields: lines.map(fieldOf),
		start: match.index + match[1].length,
		end: match.index + match[1].length + match[2].length,
	};
}

/** The field names of a row schema, or `null` when there is no object to read. */
function schemaFields(source) {
	const body = schemaBody(source);
	return body === null ? null : new Set(body.fields.filter((field) => field !== null));
}

/**
 * A row schema with the fields this run emits, and nothing else touched.
 *
 * The generator owns which columns are in a schema and a person owns everything
 * around them, so a regeneration adds and removes field lines in place rather
 * than writing the file again. Rewriting it whole reordered columns somebody had
 * grouped and reflowed prose somebody had edited, across 52 files, which is how
 * `pnpm generate:schemas --write` became a thing nobody could run (#534).
 *
 * A new field lands after the last field ahead of it in the emitted order that
 * the file already has, so a column a migration appended appends here too.
 */
function mergedSchema(current, emitted) {
	const held = schemaBody(current);
	const wanted = schemaBody(emitted);
	if (held === null || wanted === null) return null;

	const merged = mergedLines(held, linesByField(wanted));
	return held.text.slice(0, held.start) + merged.join('\n') + held.text.slice(held.end);
}

/** The body of the merge: the surviving lines, with the new ones placed among them. */
function mergedLines(held, wantedLines) {
	const order = [...wantedLines.keys()];
	const missing = order.filter((field) => !held.fields.includes(field));
	// A field this run does not emit goes. A line naming no field is a comment or
	// a blank somebody put there, and stays where it is.
	const surviving = held.lines.filter(
		(_, index) => held.fields[index] === null || wantedLines.has(held.fields[index]),
	);
	const placed = surviving.flatMap((line) => [
		...missingBefore(missing, order, fieldOf(line), wantedLines),
		line,
	]);

	return [...placed, ...missing.map((field) => wantedLines.get(field))];
}

/** Each field's line, keyed by field, in the order the generator writes them. */
function linesByField(body) {
	return new Map(
		body.fields
			.map((field, index) => [field, body.lines[index]])
			.filter(([field]) => field !== null),
	);
}

/**
 * The fields still to be placed that belong ahead of `field`, taken off the list.
 *
 * A line naming no field ranks at `-1` and nothing sorts before that, so a
 * comment in the middle of the object never has a new column landed on top of it.
 */
function missingBefore(missing, order, field, wantedLines) {
	const due = missing.filter((candidate) => order.indexOf(candidate) < order.indexOf(field));
	for (const placed of due) missing.splice(missing.indexOf(placed), 1);
	return due.map((placed) => wantedLines.get(placed));
}

console.log(`tables in migrations: ${realTables.size}`);
console.log(
	`schemas and collections emitted: ${emitted.length}${WRITE ? ' (written)' : CHECK ? ' (checking)' : ' (dry run)'}`,
);
console.log(`uuid columns detected: ${uuidColumns.size}`);

// Named rather than only counted: a table the migrations create but tables.ts has
// no interface for is invisible to everything below, including the drift check.
const uncovered = [...realTables].filter((t) => !emitted.some((e) => e.table === t)).sort();
if (uncovered.length) console.log(`\nno Kysely interface, so not emitted: ${uncovered.join(', ')}`);
for (const line of report) console.log(line);

if (WRITE) {
	for (const { path, source, ownership } of artifacts) {
		const current = ownership === 'scaffolded' ? readIfPresent(path) : null;
		let text = source;
		if (current !== null) {
			text = mergedSchema(current, source);
			if (text === null) {
				console.log(
					`${relative(ROOT, path)} has no z.object to merge into, so it is scaffolded again.`,
				);
				text = source;
			}
		}
		writeFileSync(path, formatted(text, path), 'utf8');
	}
}

/** The file, or `null` when there is none to merge into. */
function readIfPresent(path) {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return null;
	}
}

if (!CHECK) process.exit(0);

const findings = [];

for (const { path, source, ownership } of artifacts) {
	const name = relative(ROOT, path).replace(/\\/g, '/');
	let current;
	try {
		current = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
	} catch {
		findings.push(`${name} does not exist. Write it: pnpm generate:schemas --write`);
		continue;
	}

	if (ownership === 'generated') {
		const expected = formatted(source, path).replace(/\r\n/g, '\n');
		if (current === expected) continue;
		findings.push(`${name} is not what the generator emits.`);
		for (const line of firstDifferences(current, expected)) findings.push(line);
		findings.push('  Regenerate it: pnpm generate:schemas --write');
		continue;
	}

	const held = schemaFields(current);
	if (held === null) {
		findings.push(
			`${name} has no z.object this check can read, so nothing holds its field list to the ` +
				'database. Restore the generated shape, or teach schemaFields in ' +
				'scripts/generate-table-schemas.mjs the new one.',
		);
		continue;
	}

	const wanted = schemaFields(source);
	const extra = [...held].filter((field) => !wanted.has(field));
	const missing = [...wanted].filter((field) => !held.has(field));
	if (extra.length === 0 && missing.length === 0) continue;

	if (extra.length > 0) {
		findings.push(
			`${name} carries ${extra.join(', ')}, which this generator does not emit. A client ` +
				'receives every field in this schema, so a column added here by hand is a column on ' +
				'the wire. If it is withheld, take it out; if it is meant to reach clients, take it ' +
				'out of WITHHELD in scripts/withheld-columns.mjs and regenerate.',
		);
	}
	if (missing.length > 0) {
		findings.push(
			`${name} is missing ${missing.join(', ')}, which this generator emits. Either a ` +
				'migration nobody regenerated after, or a column that has left WITHHELD in ' +
				'scripts/withheld-columns.mjs and should go back. Regenerate: pnpm generate:schemas ' +
				'--write',
		);
	}
}

if (findings.length === 0) {
	console.log(`\nthe checked-in files are what this emits: ${artifacts.length} files.`);
	process.exit(0);
}

console.error('');
for (const line of findings) console.error(line);
process.exit(1);

/**
 * The first few differing lines, with their line numbers.
 *
 * A whole diff buries the answer; a count is not one at all. Same shape as
 * `generate-table-types.mjs`, which gates its one file the same way.
 */
function firstDifferences(current, expected, limit = 4) {
	const left = current.split('\n');
	const right = expected.split('\n');
	const at = (lines, index) => lines[index] ?? '(end of file)';

	return [...Array(Math.max(left.length, right.length)).keys()]
		.filter((index) => left[index] !== right[index])
		.slice(0, limit)
		.flatMap((index) => [
			`  line ${index + 1}`,
			`    checked in: ${at(left, index)}`,
			`    generator:  ${at(right, index)}`,
		]);
}
