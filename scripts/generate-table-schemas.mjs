#!/usr/bin/env node
/**
 * Writes, per table, a zod schema into `packages/sync/src/collections/tables` and
 * a collection factory into `packages/sync/src/collections` — plus the barrel over
 * the factories and the type-level drift check that holds the schemas to the
 * database.
 *
 * Run it once when a migration adds or changes a table, then own the output by
 * hand — a schema is where a table's client-side decisions live (which enum a
 * column really is, which shape its metadata takes), and those do not survive a
 * regeneration. The drift check is what catches the ones you forget.
 *
 * The one decision that must *not* be owned by hand is which columns a client
 * never receives, because a regeneration would put them back. `OMIT` and
 * `WITHHELD` below are where that is said, and both the schema and the drift
 * check are generated from them together.
 *
 * The collection files are a different matter: every one of them is the same six
 * lines with a table name substituted, because everything a table can differ by is
 * either in its schema or declared by the client calling the factory. Editing one
 * by hand is a signal that something belongs in `functions/sync-collection.ts`.
 *
 * It reads two sources. `packages/db/src/tables.ts` gives the columns and their
 * TypeScript types. The migrations give which tables exist and which columns are
 * genuinely `uuid` — the TS type is `string` for both a uuid and a WorkOS id,
 * and `workos_user_id` is text.
 *
 * ```sh
 * pnpm generate:schemas          # dry run: reports what it would emit
 * pnpm generate:schemas --write  # write the files
 * pnpm check:write               # the output is not written pre-formatted
 * ```
 *
 * It is regex over TypeScript, so it is exactly as robust as that sounds. The
 * drift check is the backstop, and it has already caught this script dropping
 * columns with digits in their names, dropping columns whose type spans lines,
 * and resolving an `extends` clause to nothing.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTIONS = join(ROOT, 'packages/sync/src/collections');
const OUT = join(COLLECTIONS, 'tables');
const WRITE = process.argv.includes('--write');

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

const enums = new Map();
for (const m of tablesSrc.matchAll(/export type (\w+) =\s*((?:\s*\|?\s*'[^']*')+);/g)) {
	enums.set(
		m[1],
		[...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]),
	);
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

/**
 * Columns one table withholds, and why.
 *
 * `OMIT` above is a property of the column — geometry is too heavy to stream, and
 * a soft-deleted row is filtered by the shape predicate before it exists for a
 * client. This is a property of the *audience*: the column is ordinary, and this
 * particular table's readers are not the people it is for.
 *
 * Both halves of the withholding are generated from here — the column's absence
 * from the schema, and the drift check's licence to expect it absent. That
 * matters because the drift check is what makes a new column a build error, and
 * an entry here is the only way to answer it other than adding the column to the
 * schema. Withholding by hand-editing a schema file lasts until the next
 * `pnpm generate:schemas`; withholding here is the statement itself.
 *
 * The emitted `Drift<…>` constrains these names to `keyof …Table`, so a column
 * that is renamed or dropped by a migration fails the build rather than sitting
 * here withholding nothing.
 */
const WITHHELD = {
	organizations: {
		reason:
			"the operator's view of an agency rather than the agency's own record. They are written and read in the operator console (`apps/admin`), which reaches them over REST; `subscription_notes` in particular is what operators write *about* an agency. An agency that should see its own subscription state is a product decision to make deliberately, not a column to leave streaming by default",
		columns: [
			'subscription_status',
			'billing_mode',
			'billing_contact_name',
			'billing_contact_email',
			'subscription_notes',
		],
	},
};

const withheldColumns = (table) => new Set(WITHHELD[table]?.columns ?? []);

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
	for (const { column, tsType } of columnsOf(name)) {
		if (OMIT.has(column) || withheld.has(column)) continue;
		const { zod, unknownType } = zodFor(column, tsType);
		if (zod === null) unknown.push(`${column}: ${unknownType}`);
		else lines.push(`\t${column}: ${zod},`);
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
						'`scripts/generate-table-schemas.mjs`, never by deleting a line below — that ' +
						'lasts until the next regeneration, and the drift check reads the same list.',
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

	emitted.push({ table, name, schemaName, typeName: singular, factoryName, shapePathName });

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
	if (WRITE) writeFileSync(join(OUT, `${table}.ts`), file, 'utf8');

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
	if (WRITE) writeFileSync(join(COLLECTIONS, `${table}.ts`), collection, 'utf8');
}

// ---------------------------------------------------------------------------
// The drift check, as one type-level test.
// ---------------------------------------------------------------------------
const imports = emitted
	.map((e) => `import type { ${e.typeName} } from '../../../../collections/tables/${e.table}.js';`)
	.sort()
	.join('\n');

const cases = emitted
	.map((e) => {
		const withheld = [...withheldColumns(e.table)].map((c) => `'${c}'`);
		const argument = withheld.length === 0 ? '' : `, ${withheld.join(' | ')}`;

		return `type ${e.typeName}Drift = Drift<${e.typeName}, ${e.name}Table${argument}>;
type _${e.typeName} = Assert<${e.typeName}Drift>;`;
	})
	.join('\n');

const tableImports = emitted
	.map((e) => `\t${e.name}Table,`)
	.sort()
	.join('\n');

const driftTest = `import { describe, expect, it } from 'vitest';
import type {
${tableImports}
} from '@simmer-mosquito/db';
${imports}

/**
 * Drift between a collection schema and the database.
 *
 * These assertions fail \`tsc\`, not the runner. A column added to a table in a
 * migration, renamed, or given a different type shows up here as a build error
 * naming the column, rather than as a row that silently arrives with a field no
 * schema knows about.
 *
 * Only \`tsc\` can see it, so the file has one runtime test to keep vitest happy.
 */

/** Columns no client receives, on any table, so their absence is correct. */
type ClientOmitted = 'geom' | 'geojson' | 'deleted_at' | 'deleted_by_profile_id';

/**
 * A key in the table that no schema field covers, or the reverse.
 *
 * \`TWithheld\` is what one table keeps from its readers, passed at the call sites
 * below and declared in \`WITHHELD\` in \`scripts/generate-table-schemas.mjs\`, which
 * generates both this file and the schema the column is missing from. It is
 * constrained to \`keyof TTable\`, so withholding a column a migration has since
 * renamed or dropped is an error here rather than a line that quietly withholds
 * nothing.
 */
type Drift<TSchema, TTable, TWithheld extends keyof TTable = never> =
	| Exclude<keyof TTable, keyof TSchema | ClientOmitted | TWithheld>
	| Exclude<keyof TSchema, keyof TTable>;

/** Errors with the offending column names when \`T\` is not \`never\`. */
type Assert<T extends never> = T;

${cases}

describe('collection schemas against the database', () => {
	it('is checked by tsc rather than by the runner', () => {
		// Every assertion above is a type. This keeps the file a valid suite.
		expect(true).toBe(true);
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
 * Four modules from \`functions/\` are exported alongside them, because a caller
 * cannot use a factory without them: the options each one takes, the wrapper that
 * names a write's command, the refusal a rejected write throws, and the route
 * derivation the server registers against. The rest of \`functions/\` is how the
 * factories are built and is nobody else's business.
 *
 * Generated by \`pnpm generate:schemas\`. Biome sorts the exports below, so the
 * four are somewhere in the middle of the list rather than at the top.
 */

export * from './functions/mutate-collection.js';
export * from './functions/routes.js';
export * from './functions/sync-collection.js';
export * from './functions/write-command.js';

export * from './tables/index.js';

${emitted
	.map((e) => `export * from './${e.table}.js';`)
	.sort()
	.join('\n')}
`;

console.log(`tables in migrations: ${realTables.size}`);
console.log(
	`schemas and collections emitted: ${emitted.length}${WRITE ? ' (written)' : ' (dry run)'}`,
);
console.log(`uuid columns detected: ${uuidColumns.size}`);

// Named rather than only counted: a table the migrations create but tables.ts has
// no interface for is invisible to everything below, including the drift check.
const uncovered = [...realTables].filter((t) => !emitted.some((e) => e.table === t)).sort();
if (uncovered.length) console.log(`\nno Kysely interface, so not emitted: ${uncovered.join(', ')}`);
for (const line of report) console.log(line);

if (WRITE) {
	writeFileSync(join(COLLECTIONS, 'index.ts'), barrel, 'utf8');
	writeFileSync(join(OUT, 'index.ts'), schemaRegistry, 'utf8');
	writeFileSync(
		join(ROOT, 'packages/sync/src/tests/unit/collections/tables/drift.test.ts'),
		driftTest,
		'utf8',
	);
}
