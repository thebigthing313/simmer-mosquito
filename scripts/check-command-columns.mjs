#!/usr/bin/env node
/**
 * Asserts that every column name an intent handler reads is a real column.
 *
 * A command body's keys are two languages at once. `snake_case` means a column
 * of the record being written. `camelCase` means anything else: an
 * acknowledgement, an instruction such as `locationSource`, or an argument that
 * becomes a different record. The client half is safe by construction: the keys
 * a mutation sends are `withoutServerOwnedColumns(mutation.changes)`, so they
 * come off the generated row type and cannot be misspelled.
 *
 * The server half is hand-typed. Every handler in
 * `apps/server/src/table-commands/` reads its keys as string literals:
 *
 * ```ts
 * regionFolderId: readNullableText(payload.region_folder_id),
 * ```
 *
 * `payload` is a loose record, so writing `region_folder_ids` there compiles.
 * The read returns `undefined`, the reader turns that into `null`, the Region
 * leaves its folder, and the caller gets a 200. Nothing else in the workspace
 * can see it: the reads have `drift.test.ts` in `packages/sync`, and the writes
 * had nothing.
 *
 * So this reads both halves and requires them to agree in one direction only:
 *
 * - every `snake_case` key a handler reads must be a column of the table that
 *   handler's module serves.
 *
 * The reverse is not checked and must not be. A handler reads only the keys its
 * command takes, and a column no command writes is normal.
 *
 * Run it with `pnpm check:command-columns`.
 *
 * ## What counts as a column name
 *
 * A key with an underscore in it. A single lowercase word is spelled the same in
 * both languages, and both are there: `name`, `code` and `metadata` are columns,
 * while `context`, `geometry` and `changes` are domain arguments with no column
 * to be named after. Flagging those would make the check unusable, and there is
 * nothing in the key itself to tell them apart, so single-word keys are out of
 * scope.
 *
 * ## The three forms a read takes
 *
 * `payload.some_column` and `'some_column' in payload` are the two direct ones.
 * The third is a column named in a pair table and read back dynamically:
 * `weather.ts` keeps its seven metric columns beside the domain field each
 * becomes in `METRIC_COLUMNS`, then reads `payload[column]`. The lookup itself
 * says nothing a static read can check, so the literal that feeds it is what
 * gets checked. See `KEY_READS`.
 *
 * A column name reaching a handler by any fourth route is unchecked, and the
 * table count is the only thing that would notice. Prefer the direct forms.
 *
 * ## Keys that name another record's column
 *
 * A handful of `snake_case` keys are columns, just not of the table being
 * written. A Mission planned from a Route arrives with the stops it is made of;
 * an Assignment created from a Route carries `route_id`. Spelling those
 * `camelCase` would be worse, because they *are* column names and a reader
 * would take them for instructions. They are listed in `CROSS_RECORD_KEYS` with
 * what each names, and an entry nothing reads any more is a failure too. An
 * allowlist that outlives its handler is how a check goes quiet.
 *
 * ## Which table a handler is about
 *
 * Most modules export one factory per table and declare the table inside it, so
 * the enclosing function is the answer. Two do not: `control-methods.ts` and
 * `org-lookups.ts` build several catalogs from one shared factory, and that
 * factory takes the table from its caller. A check that only read
 * `table: '…'` inside the function doing the reading would report clean over
 * seven tables. So a function with no table of its own inherits the tables of
 * the functions that call it, and only then falls back to its module's.
 *
 * `EXPECTED_TABLE_COUNT` is what keeps that from degrading quietly. A table that
 * stops being matched does not make the check pass on fewer tables; it fails.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMAND_DIR = join(workspaceRoot, 'apps/server/src/table-commands');
const SCHEMA_DIR = join(workspaceRoot, 'packages/sync/src/collections/tables');

/**
 * The mechanism, not a table.
 *
 * `dispatch.ts` reads `intents` and `id` off the body before any handler sees
 * it, and `index.ts` is the list of factories. Neither reads a column.
 */
const NOT_A_TABLE_MODULE = new Set(['dispatch.ts', 'index.ts']);

/**
 * How many tables the surface serves.
 *
 * Asserted rather than assumed. Adding a table means raising this; a table that
 * falls out of the match lowers it and fails, which is the point. A silent
 * "nothing to check here" is the one failure mode a check like this has.
 */
const EXPECTED_TABLE_COUNT = 51;

/**
 * The `snake_case` keys that name a column of some other record, by module.
 *
 * Every one of these is a command reaching past its own row: creating a record
 * from another one, or naming the children a create brings with it. The module's
 * own "Field names" section says the same thing in prose; this is the half a
 * check can read.
 *
 * Adding to this list is not free. A key belongs here only when it is genuinely
 * a column name and genuinely not this table's. An acknowledgement or an
 * instruction is `camelCase` and never needs an entry.
 */
const CROSS_RECORD_KEYS = new Map([
	['applications.application_batches', 'rows of `application_batches`, sent with the create'],
	['assignments.assignment_items', 'rows of `assignment_items`, sent with the create'],
	['assignments.route_id', 'the `routes` row an assignment is drawn from'],
	['assignments.assignment_item_ids', '`assignment_items.id`, the stops a move plan names'],
	['habitats.inspection_id', 'the `inspections` row a habitat is created from'],
	['missions.mission_items', 'rows of `mission_items`, sent with the create'],
	['missions.mission_item_ids', '`mission_items.id`, the stops a move plan names'],
	['routes.route_item_ids', '`route_items.id`, the stops a move plan names'],
]);

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * Every table's columns, from the generated row schemas.
 *
 * These rather than the Kysely table types, because they are what
 * `drift.test.ts` already holds against the database, and because they are the
 * exact set a client can send: a command body's column keys are the row type's
 * keys minus the server-owned ones.
 *
 * The file name is the table name, so no import graph has to be read to find
 * one.
 */
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
 * exactly one leading tab. Anything nested carries two or more and is skipped,
 * which is what keeps an inner object's keys from reading as columns. A file
 * that yields nothing is a failure rather than an empty column list; see the
 * caller.
 */
function readSchemaKeys(source) {
	const start = source.indexOf('z.object({');
	if (start === -1) {
		return new Set();
	}

	const body = source.slice(start);
	return new Set([...body.matchAll(/^\t([A-Za-z_][A-Za-z0-9_]*): /gm)].map(([, key]) => key));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * One module, split into the scopes a key can be attributed to.
 *
 * A scope is a top-level function plus everything it contains. What is left
 * over, meaning module-level constants and the imports, is the module's own
 * scope, and answers to every table the module declares.
 */
function readModule(file, tableNames) {
	const source = stripComments(readFileSync(join(COMMAND_DIR, file), 'utf8'));
	const lines = source.split('\n');
	const functions = topLevelFunctions(lines);

	// A module's own scope is every line outside a function, which is what
	// `METRIC_COLUMNS` and the like sit in. Taken by line number rather than by
	// matching text against the function bodies: a module-scope line whose text
	// also appears inside a function would drop out of the check silently, and
	// module scope is the looser of the two, so nothing downstream would notice.
	const inside = new Set(functions.flatMap((fn) => fn.lineNumbers));
	const outside = lines.filter((_line, index) => !inside.has(index)).join('\n');

	const declared = tablesIn(outside, tableNames);
	for (const fn of functions) {
		fn.tables = tablesIn(fn.body, tableNames);
		for (const table of fn.tables) {
			declared.add(table);
		}
	}

	resolveByCaller(functions);

	return { file, functions, outside, declared };
}

/**
 * Every top-level function in the module, with its body.
 *
 * Brace matching is not needed: the workspace is formatted with tabs, so a
 * top-level function is the only thing that opens at column zero and the `}`
 * that closes it is the only bare one.
 */
function topLevelFunctions(lines) {
	const found = [];
	let current = null;

	for (const [index, line] of lines.entries()) {
		if (current === null) {
			const opened = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/.exec(line);
			if (opened !== null) {
				const exported = line.startsWith('export ');
				current = { name: opened[1], body: '', exported, lineNumbers: [index] };
			}
			continue;
		}

		current.lineNumbers.push(index);
		if (line === '}') {
			found.push(current);
			current = null;
			continue;
		}
		current.body += `${line}\n`;
	}

	return found;
}

/** Every known table name this text names as a string literal. */
function tablesIn(text, tableNames) {
	const found = new Set();
	for (const [, literal] of text.matchAll(/'([a-z][a-z0-9_]*)'/g)) {
		if (tableNames.has(literal)) {
			found.add(literal);
		}
	}
	return found;
}

/**
 * A shared factory answers to the tables of everything that calls it.
 *
 * Run to a fixed point, so a factory called by a factory still resolves.
 */
function resolveByCaller(functions) {
	let changed = true;
	while (changed) {
		changed = false;
		for (const fn of functions) {
			if (fn.tables.size === 0 && inheritTables(fn, functions)) {
				changed = true;
			}
		}
	}
}

/** Adds every table a caller of `fn` declares. True if that added anything. */
function inheritTables(fn, functions) {
	const calls = new RegExp(`\\b${fn.name}\\s*\\(`);
	let added = false;

	for (const caller of functions) {
		if (caller === fn || !calls.test(caller.body)) {
			continue;
		}
		for (const table of caller.tables) {
			if (!fn.tables.has(table)) {
				fn.tables.add(table);
				added = true;
			}
		}
	}

	return added;
}

/**
 * The three forms a scope can name a column in.
 *
 * The first two are direct reads: `payload.some_column`, and `'some_column' in
 * payload`. Either may carry a `request.` in front, because `control-methods.ts`
 * takes the whole request rather than destructuring it.
 *
 * The third is a column named in a pair table and read back through
 * `payload[column]`, which is how `weather.ts` keeps its seven metrics beside
 * the domain field each becomes. A dynamic read is invisible on its own, and
 * those seven are exactly what a migration renaming a column would strip, so the
 * literal that feeds the lookup is what gets checked instead.
 *
 * Single-word keys are skipped; see the header.
 */
const KEY_READS = [
	// The lookbehind keeps `'../command-payload.js'` from reading as a key.
	/(?<![\w-])payload\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g,
	/'([A-Za-z_][A-Za-z0-9_]*)'\s+in\s+(?:[A-Za-z0-9_]+\s*\.\s*)?payload\b/g,
	/\[\s*'([a-z][a-z0-9_]*)'\s*,/g,
];

function columnKeysIn(text) {
	const keys = new Set();

	for (const pattern of KEY_READS) {
		for (const [, key] of text.matchAll(pattern)) {
			if (isColumnKey(key)) {
				keys.add(key);
			}
		}
	}

	return keys;
}

function isColumnKey(key) {
	return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(key);
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

function main() {
	const columnsByTable = readColumnsByTable();
	const tableNames = new Set(columnsByTable.keys());

	const modules = readdirSync(COMMAND_DIR)
		.filter((file) => file.endsWith('.ts') && !NOT_A_TABLE_MODULE.has(file))
		.map((file) => readModule(file, tableNames));

	const run = { columnsByTable, tableNames, failures: [], covered: new Set(), read: new Set() };
	run.checked = 0;

	for (const module of modules) {
		checkModule(run, module);
	}
	checkAllowlist(run);
	checkTableCount(run);

	report(run);
}

/** One module's declared tables, its unmatched factories, and its column reads. */
function checkModule(run, module) {
	for (const table of module.declared) {
		run.covered.add(table);
	}

	checkFactoriesResolved(run, module);

	for (const scope of scopesOf(module)) {
		checkScope(run, module, scope);
	}
}

/**
 * Every exported factory has to have resolved to a table.
 *
 * Left unsaid, one that did not would have its handlers checked against the
 * whole module and the table count would still add up.
 */
function checkFactoriesResolved(run, module) {
	const unmatched = module.functions.filter(
		(fn) => fn.exported && fn.name.endsWith('TableCommands') && fn.tables.size === 0,
	);

	for (const fn of unmatched) {
		run.failures.push(
			`${module.file}: ${fn.name} declares no table this check could find. ` +
				'It names the table some way the check does not read; teach it that form.',
		);
	}
}

/**
 * The scopes a key can be attributed to, most specific first.
 *
 * A function that declares no table of its own and inherited none from a caller
 * falls back to its module's tables; a module that declares none, which is
 * `shared.ts` reading the polymorphic `entity_type`/`entity_id` pair for
 * whichever table imports it, falls back to the surface as a whole.
 */
function scopesOf(module) {
	return [
		...module.functions.map((fn) => ({
			where: `${module.file}: ${fn.name}`,
			text: fn.body,
			tables: fn.tables.size > 0 ? fn.tables : module.declared,
		})),
		{ where: module.file, text: module.outside, tables: module.declared },
	];
}

function checkScope(run, module, scope) {
	const tables = scope.tables.size > 0 ? scope.tables : run.tableNames;

	for (const key of columnKeysIn(scope.text)) {
		const exception = `${module.file.slice(0, -'.ts'.length)}.${key}`;
		if (CROSS_RECORD_KEYS.has(exception)) {
			run.read.add(exception);
			continue;
		}

		run.checked += 1;
		if ([...tables].some((table) => run.columnsByTable.get(table)?.has(key))) {
			continue;
		}
		run.failures.push(
			`${scope.where} reads \`payload.${key}\`, which is not a column of ` +
				`${[...tables].sort().join(', ')}.`,
		);
	}
}

function checkAllowlist(run) {
	for (const [exception, reason] of CROSS_RECORD_KEYS) {
		if (!run.read.has(exception)) {
			run.failures.push(
				`CROSS_RECORD_KEYS lists ${exception} (${reason}), and no handler reads it. ` +
					'Delete the entry.',
			);
		}
	}
}

function checkTableCount(run) {
	if (run.covered.size === EXPECTED_TABLE_COUNT) {
		return;
	}
	run.failures.push(
		`The check covers ${run.covered.size} tables and expects ${EXPECTED_TABLE_COUNT}. ` +
			'Adding a table means raising EXPECTED_TABLE_COUNT in this script; a drop means ' +
			'a table stopped being matched and its handlers are no longer checked.',
	);
}

function report(run) {
	if (run.failures.length === 0) {
		console.log(
			`${run.checked} column reads across ${run.covered.size} tables agree with the ` +
				'generated schemas.',
		);
		return;
	}

	console.error('Command handlers read column names that do not exist.\n');
	for (const failure of run.failures) {
		console.error(`  ${failure}`);
	}
	console.error(
		'\nA `snake_case` key names a column of the table its module serves. A key that ' +
			'names anything else, an acknowledgement or an instruction or another record, ' +
			'is `camelCase` and is not checked.',
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const QUOTES = new Set(["'", '"', '`']);

/**
 * Removes line and block comments, leaving strings alone.
 *
 * Every module here opens with a docstring naming the columns it reads, and
 * several spell them as `payload.habitat_id` in prose. Scanning those would
 * check the documentation rather than the code.
 */
function stripComments(text) {
	let out = '';
	let index = 0;

	while (index < text.length) {
		const span = spanAt(text, index);
		out += span.keep;
		index = span.next;
	}

	return out;
}

/**
 * The run of text starting at `index`, and what survives it.
 *
 * A string survives whole, a line comment leaves nothing, and a block comment
 * leaves its newlines so line-based splitting still lines up.
 */
function spanAt(text, index) {
	const char = text[index];

	if (QUOTES.has(char)) {
		const end = endOfString(text, index);
		return { keep: text.slice(index, end), next: end };
	}

	if (char === '/') {
		return commentSpan(text, index) ?? { keep: char, next: index + 1 };
	}

	return { keep: char, next: index + 1 };
}

/** The comment starting at `index`, or null if a `/` opened something else. */
function commentSpan(text, index) {
	if (text[index + 1] === '/') {
		const end = text.indexOf('\n', index);
		return { keep: '', next: end === -1 ? text.length : end };
	}

	if (text[index + 1] !== '*') {
		return null;
	}

	const close = text.indexOf('*/', index + 2);
	const end = close === -1 ? text.length : close;
	return { keep: text.slice(index, end).replace(/[^\n]/g, ''), next: end + 2 };
}

/** The index just past the string starting at `start`. */
function endOfString(text, start) {
	const quote = text[start];
	let index = start + 1;

	while (index < text.length) {
		if (text[index] === '\\') {
			index += 2;
			continue;
		}
		if (text[index] === quote) {
			return index + 1;
		}
		index += 1;
	}

	return text.length;
}

main();
