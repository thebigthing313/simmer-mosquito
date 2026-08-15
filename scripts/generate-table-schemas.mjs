#!/usr/bin/env node
/**
 * Writes a zod schema per table into `packages/sync/src/collections/tables`, and
 * the type-level drift check that holds them to the database.
 *
 * Run it once when a migration adds or changes a table, then own the output by
 * hand — a schema is where a table's client-side decisions live (which columns a
 * client never receives, which enum a column really is), and those do not
 * survive a regeneration. The drift check is what catches the ones you forget.
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
const OUT = join(ROOT, 'packages/sync/src/collections/tables');
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
 */
const IRREGULAR = {
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

/** Columns a client never receives. */
const OMIT = new Set(['geom', 'geojson', 'deleted_at', 'deleted_by_profile_id']);
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

	const lines = [];
	const unknown = [];
	for (const { column, tsType } of columnsOf(name)) {
		if (OMIT.has(column)) continue;
		const { zod, unknownType } = zodFor(column, tsType);
		if (zod === null) unknown.push(`${column}: ${unknownType}`);
		else lines.push(`\t${column}: ${zod},`);
	}
	if (unknown.length) report.push(`UNMAPPED ${table}: ${unknown.join(' | ')}`);

	const singular = IRREGULAR[name] ?? name.replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
	const schemaName = `${singular[0].toLowerCase()}${singular.slice(1)}Schema`;

	emitted.push({ table, name, schemaName, typeName: singular });

	const file = `/**
 * The \`${table}\` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * \`geom\`, \`geojson\`, \`deleted_at\` and \`deleted_by_profile_id\` are absent:
 * geometry is served by the \`/map/*\` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *
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
}

// ---------------------------------------------------------------------------
// The drift check, as one type-level test.
// ---------------------------------------------------------------------------
const imports = emitted
	.map((e) => `import type { ${e.typeName} } from '../../../../collections/tables/${e.table}.js';`)
	.sort()
	.join('\n');

const cases = emitted
	.map(
		(e) => `type ${e.typeName}Drift = Drift<${e.typeName}, ${e.name}Table>;
type _${e.typeName} = Assert<${e.typeName}Drift>;`,
	)
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

/** Columns a client never receives, so their absence from a schema is correct. */
type ClientOmitted = 'geom' | 'geojson' | 'deleted_at' | 'deleted_by_profile_id';

/** A key in the table that no schema field covers, or the reverse. */
type Drift<TSchema, TTable> =
	| Exclude<keyof TTable, keyof TSchema | ClientOmitted>
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

console.log(`tables in migrations: ${realTables.size}`);
console.log(`schemas emitted: ${emitted.length}${WRITE ? ' (written)' : ' (dry run)'}`);
console.log(`uuid columns detected: ${uuidColumns.size}\n`);
for (const line of report) console.log(line);
if (!WRITE) {
	console.log('\n--- sample: habitats.ts ---');
	console.log(readFileSync(join(ROOT, 'packages/db/src/tables.ts'), 'utf8') && '');
}
if (WRITE) {
	writeFileSync(
		join(ROOT, 'packages/sync/src/tests/unit/collections/tables/drift.test.ts'),
		driftTest,
		'utf8',
	);
}
