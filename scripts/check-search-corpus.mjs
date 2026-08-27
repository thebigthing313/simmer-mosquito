#!/usr/bin/env node
/**
 * Holds the search corpus declaration to the schema, to the withholding rule,
 * and to the migration that actually indexes it.
 *
 * `SEARCH_CORPUS` in `packages/db/src/domains/search.ts` names a table, its
 * identifier fields and its prose fields. Three things can go wrong in it and
 * none of them is visible at runtime:
 *
 * 1. **A field that is not a column.** The projection reads `fields ->> 'key'`,
 *    so a misspelled or renamed column produces a null, the document indexes
 *    nothing for it, and the search returns fewer rows than it should. There is
 *    no error anywhere.
 * 2. **A field the client is not allowed to receive.** The index is a second
 *    copy of the text, read back over an endpoint with no column list of its own.
 *    A column in `OMIT` or in `WITHHELD` is one sync deliberately keeps off the
 *    wire, and putting it in a search document puts it back. This is the
 *    withholding rule enforced by a machine rather than by memory.
 * 3. **A declared table with no trigger, or a trigger with no declaration.** The
 *    first is a table the reader ranks and nothing ever writes a document for;
 *    the second is a table whose documents are written and never searched.
 *
 * Generating the migration from the declaration instead would be a new machine,
 * and a migration is immutable once applied, so a regeneration could only ever
 * emit a second migration. A declaration plus a check is the cheaper half.
 *
 * Run it with `pnpm check:search-corpus`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withheldColumnsFor } from './withheld-columns.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_DIR = join(workspaceRoot, 'packages/sync/src/collections/tables');
const MIGRATIONS_DIR = join(workspaceRoot, 'packages/db/migrations');
const CORPUS_SOURCE = join(workspaceRoot, 'packages/db/src/domains/search.ts');
const DOMAIN_SOURCE = join(workspaceRoot, 'packages/domain/src/search/search-result.ts');

/**
 * Columns the schema generator drops from every table.
 *
 * Copied from `generate-table-schemas.mjs` rather than imported, because that
 * module runs the generator on import. `deleted_at` is the one that matters
 * here: a search document is deleted when its row is, so indexing the column
 * would be indexing a timestamp, but the shape of the mistake is the same.
 */
const OMITTED_COLUMNS = new Set(['geom', 'geojson', 'deleted_at', 'deleted_by_profile_id']);

/**
 * How many document classes the corpus holds: twelve record tables plus
 * comments.
 *
 * Asserted rather than assumed. A parse that stops matching does not make this
 * check pass over nothing; it fails. A silent "nothing to check here" is the one
 * failure mode a check like this has.
 */
const EXPECTED_DOCUMENT_CLASSES = 13;

function main() {
	const corpus = readCorpus();
	const failures = [
		...checkDocumentClassCount(corpus),
		...checkDeclaredFields(corpus, readColumnsByTable()),
		...checkTriggerParity(corpus, readTriggerTables()),
		...checkDomainParity(corpus, readDomainCorpusTables()),
	];

	if (failures.length > 0) {
		console.error('Search corpus check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		process.exitCode = 1;
		return;
	}

	const fieldCount = [...corpus.values()].reduce((sum, fields) => sum + fields.length, 0);
	console.log(
		`Search corpus OK: ${corpus.size} document classes, ${fieldCount} indexed fields, ` +
			`${readTriggerTables().size} tables with triggers.`,
	);
}

/** A parse that stopped matching must fail, not pass over nothing. */
function checkDocumentClassCount(corpus) {
	if (corpus.size === EXPECTED_DOCUMENT_CLASSES) {
		return [];
	}

	return [
		`SEARCH_CORPUS declares ${corpus.size} document classes; expected ${EXPECTED_DOCUMENT_CLASSES}. ` +
			'Either a table joined or left the corpus, or this script stopped reading the declaration.',
	];
}

/** Rules 1 and 2: every declared field is a real column, and none is withheld. */
function checkDeclaredFields(corpus, columnsByTable) {
	const failures = [];

	for (const [table, fields] of corpus) {
		const columns = columnsByTable.get(table);
		if (columns === undefined) {
			failures.push(`${table} is in SEARCH_CORPUS but has no generated row schema.`);
			continue;
		}

		const withheld = withheldColumnsFor(table);
		for (const field of fields) {
			if (!columns.has(field)) {
				failures.push(`${table}.${field} is declared for search but is not a column of ${table}.`);
			}
			if (OMITTED_COLUMNS.has(field)) {
				failures.push(
					`${table}.${field} is omitted from every row schema and must not be indexed for search.`,
				);
			}
			if (withheld.has(field)) {
				failures.push(
					`${table}.${field} is withheld from sync readers and must not be indexed for search: ` +
						'the index is read back over an endpoint that has no column list of its own.',
				);
			}
		}
	}

	return failures;
}

/** Rule 3, both ways: a declaration with no trigger, and a trigger with no declaration. */
function checkTriggerParity(corpus, triggerTables) {
	const failures = [];

	for (const table of corpus.keys()) {
		if (!triggerTables.has(table)) {
			failures.push(
				`${table} is in SEARCH_CORPUS but no migration creates a search trigger for it.`,
			);
		}
	}
	for (const table of triggerTables) {
		if (!corpus.has(table)) {
			failures.push(`${table} has a search trigger but is not in SEARCH_CORPUS.`);
		}
	}

	return failures;
}

/**
 * The domain owns the twelve-table union the client renders and the order ties
 * break in; `packages/db` owns the fields. They have to name the same tables in
 * the same order, or the reader would rank a table the client has no route for.
 */
function checkDomainParity(corpus, domainTables) {
	const declared = [...corpus.keys()].filter((table) => table !== 'comments');
	if (declared.join(',') === domainTables.join(',')) {
		return [];
	}

	return [
		'CORPUS_TABLES in packages/domain and SEARCH_CORPUS in packages/db name different tables ' +
			`or a different order.\n  domain: ${domainTables.join(', ')}\n  db:     ${declared.join(', ')}`,
	];
}

/**
 * `SEARCH_CORPUS`, as a table to its declared fields in declared order.
 *
 * Read as text rather than imported, because importing it would mean building
 * `packages/db` first, and a check that needs a build to run is a check that
 * stops being run.
 */
function readCorpus() {
	const source = readFileSync(CORPUS_SOURCE, 'utf8');
	const start = source.indexOf('export const SEARCH_CORPUS');
	if (start === -1) {
		throw new Error('SEARCH_CORPUS not found. Has the declaration moved?');
	}
	const end = source.indexOf('\n};', start);
	const body = source.slice(start, end);

	const corpus = new Map();
	// One entry per line or per brace-wrapped block; both forms hold the same two
	// arrays, so the fields are read off those rather than off the layout.
	const entryPattern =
		/^\t([a-z_]+): \{\s*identifierFields: \[([^\]]*)\],\s*proseFields: \[([^\]]*)\],?\s*\},?$/gms;
	for (const [, table, identifiers, prose] of body.matchAll(entryPattern)) {
		corpus.set(table, [...readStringList(identifiers), ...readStringList(prose)]);
	}

	return corpus;
}

/** `CORPUS_TABLES` from `packages/domain`, in declared order. */
function readDomainCorpusTables() {
	const source = readFileSync(DOMAIN_SOURCE, 'utf8');
	const start = source.indexOf('export const CORPUS_TABLES');
	if (start === -1) {
		throw new Error('CORPUS_TABLES not found. Has the declaration moved?');
	}
	const body = source.slice(start, source.indexOf('] as const;', start));
	return readStringList(body);
}

function readStringList(text) {
	return [...text.matchAll(/'([a-z_]+)'/g)].map(([, value]) => value);
}

/**
 * Every table a migration creates a search trigger on.
 *
 * The migration set is the DDL of record here: `packages/db/schema.sql` is not
 * committed, so there is nothing else to read.
 */
function readTriggerTables() {
	const tables = new Set();

	for (const file of readdirSync(MIGRATIONS_DIR)) {
		if (!file.endsWith('.sql')) {
			continue;
		}
		const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
		const up = source.split(/^-- migrate:down$/m)[0] ?? '';
		for (const [, table] of up.matchAll(
			/create trigger \w*_search_document_write\s+after insert or delete on (\w+)/g,
		)) {
			tables.add(table);
		}
	}

	return tables;
}

/** Every table's columns, from the generated row schemas. */
function readColumnsByTable() {
	const columns = new Map();

	for (const file of readdirSync(SCHEMA_DIR)) {
		if (!file.endsWith('.ts') || file === 'index.ts') {
			continue;
		}
		const source = readFileSync(join(SCHEMA_DIR, file), 'utf8');
		const keys = readSchemaKeys(source);
		if (keys.size === 0) {
			throw new Error(`${file} has no columns this check could read. Has the generator changed?`);
		}
		columns.set(file.slice(0, -'.ts'.length), keys);
	}

	return columns;
}

/**
 * The keys of the file's one `z.object({ … })`.
 *
 * These files are generated and formatted with tabs, so a column is a line with
 * exactly one leading tab; anything nested carries two or more and is skipped.
 */
function readSchemaKeys(source) {
	const start = source.indexOf('z.object({');
	if (start === -1) {
		return new Set();
	}

	return new Set(
		[...source.slice(start).matchAll(/^\t([A-Za-z_][A-Za-z0-9_]*): /gm)].map(([, key]) => key),
	);
}

main();
