#!/usr/bin/env node
/**
 * Asserts that every write naming another record's id runs the reference gate.
 *
 * A write's own `organization_id` comes from the session, so the row it creates
 * lands in the right organization. The ids it *references* come from the
 * payload, and the only thing standing behind them used to be the Postgres
 * foreign key, which is satisfied by the row existing anywhere. So org A could
 * create a Chemical Application naming org B's Habitat and get a 201 (#200).
 *
 * `assertWriteReferences` in `packages/db/src/domains/write-references.ts` is the
 * check. Two seams call it:
 *
 * - `updateRow` runs it on the patch, so every update through it is covered.
 * - `checkedValues` wraps an insert's own object:
 *   `.values(await checkedValues(trx, organizationId, { … }))`.
 *
 * Neither can be forgotten by a writer that uses them. What a writer *can* do is
 * hand-roll the update instead of calling `updateRow`, or insert without the
 * wrap, and both compile. That is what this reads for.
 *
 * Run it with `pnpm check:write-references`.
 *
 * ## What it looks at
 *
 * Every `.values({ … })` and `.set({ … })` in `apps/server/src` and
 * `packages/db/src`, minus tests and seeds, whose object names a column in
 * `RECORD_REFERENCE_COLUMNS`. The registry is read out of the module rather than
 * copied here, so the two cannot drift.
 *
 * An object that names none of those columns is not a reference write and is not
 * this check's business. A column that is in the schema but not in the registry
 * is the *integration* test's business: `write-reference-coverage` asks Postgres
 * for every foreign key pointing at an organization-owned record and requires an
 * entry. Together they cover both directions; neither covers both on its own.
 *
 * ## The allowlist
 *
 * `SESSION_OWNED` is for a column set from `AuthContext` rather than from a
 * payload. `completed_by_profile_id` is the actor who completed the stop, the
 * same class of value as `created_by_profile_id`. There is no id to doubt, and
 * gating it would spend a query proving the session's own profile belongs to the
 * session's own organization.
 *
 * An entry that no longer matches anything is a failure. An allowlist that
 * outlives its call site is how a check goes quiet.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep as SEPARATOR } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_FILE = join(workspaceRoot, 'packages/db/src/domains/write-references.ts');
const ROOTS = ['apps/server/src', 'packages/db/src'];
const SKIP_DIRS = new Set(['tests', 'seeds', 'dist', 'node_modules']);

/**
 * The writes that name a reference column but take it from the session.
 *
 * Keyed by file, with the reason. Line numbers are deliberately not part of the
 * key: an allowlist that has to be renumbered every time a comment grows is one
 * somebody edits without reading.
 */
const SESSION_OWNED = new Map([
	[
		'apps/server/src/field-work-commands/assignment-lifecycle.ts',
		'the actor who completed or skipped the stop, from `AuthContext`',
	],
	[
		'apps/server/src/mission-dispatch-commands/mission-execution.ts',
		'the actor who completed or skipped the stop, from `AuthContext`',
	],
	[
		'apps/server/src/public-engagement-records-commands/mission-notifications.ts',
		'the actor who changed the status, from `AuthContext`',
	],
	[
		'packages/db/src/domains/identity-auth.ts',
		'the profile the sign-in flow resolved, never a payload id',
	],
	[
		'packages/db/src/domains/identity-memberships.ts',
		'the profile `assertOrganizationProfileCanBeInvited` already scoped to the organization',
	],
	[
		'packages/db/src/domains/identity-organizations.ts',
		'the profile this transaction created a moment earlier',
	],
]);

/**
 * The file the gate itself lives in, plus the one that calls it for every
 * update. Neither is a writer.
 */
const THE_GATE = new Set([
	'packages/db/src/domains/write-references.ts',
	'packages/db/src/domains/org-owned-writes.ts',
]);

function main() {
	const columns = readRegistryColumns();
	const usedAllowances = new Set();
	const failures = [];

	for (const file of sourceFiles()) {
		failures.push(...checkFile(file, columns, usedAllowances));
	}
	failures.push(...staleAllowances(usedAllowances));

	report(failures, columns.size);
}

/** The ungated reference writes in one file, as failures. */
function checkFile(file, columns, usedAllowances) {
	if (THE_GATE.has(file.path)) {
		return [];
	}

	const ungated = referenceWrites(file.source, columns).filter((write) => !write.gated);
	if (ungated.length === 0) {
		return [];
	}

	if (SESSION_OWNED.has(file.path)) {
		usedAllowances.add(file.path);
		return [];
	}

	return ungated.map(
		(write) =>
			`${file.path}:${write.line}: this ${write.kind} writes ${write.columns.join(', ')} ` +
			'without the reference gate. Wrap the object in `checkedValues`, or go through ' +
			'`updateRow` if it is an update.',
	);
}

/** An allowlist entry that outlives its call site is how a check goes quiet. */
function staleAllowances(usedAllowances) {
	return [...SESSION_OWNED]
		.filter(([path]) => !usedAllowances.has(path))
		.map(
			([path, reason]) =>
				`${path} is allowed to write a reference column ungated (${reason}), but no such ` +
				'write is there any more. Drop the entry.',
		);
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** The keys of `RECORD_REFERENCE_COLUMNS`, read from the module that owns them. */
function readRegistryColumns() {
	const source = readFileSync(REGISTRY_FILE, 'utf8');
	const start = source.indexOf('const RECORD_REFERENCE_COLUMNS = {');
	if (start === -1) {
		throw new Error(
			'RECORD_REFERENCE_COLUMNS is not where this check expects it. Has the module moved?',
		);
	}
	const body = source.slice(start, source.indexOf('\n} as const', start));
	const columns = new Set([...body.matchAll(/^\t([a-z][a-z0-9_]*): /gm)].map(([, key]) => key));
	if (columns.size === 0) {
		throw new Error('RECORD_REFERENCE_COLUMNS read as empty. Has its shape changed?');
	}
	return columns;
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

/** Every TypeScript file under the two roots, minus the directories skipped. */
function sourceFiles() {
	return ROOTS.flatMap((root) => filesUnder(root));
}

function filesUnder(root) {
	return readdirSync(join(workspaceRoot, root), { recursive: true })
		.map((entry) => `${root}/${entry.split(SEPARATOR).join('/')}`)
		.filter(isScanned)
		.map((path) => ({ path, source: readFileSync(join(workspaceRoot, path), 'utf8') }));
}

function isScanned(path) {
	return path.endsWith('.ts') && !path.split('/').some((part) => SKIP_DIRS.has(part));
}

/**
 * Every `.values({ … })` / `.set({ … })` whose object names a reference column.
 *
 * Read by indentation rather than by matching brackets. The workspace is
 * formatted with tabs, so the object a write opens is exactly the lines indented
 * deeper than the line that opened it, and a `geom` fragment full of unbalanced
 * parentheses inside a template literal cannot end it early.
 */
function referenceWrites(source, columns) {
	const lines = source.split('\n');
	return lines
		.map((_line, index) => writeAt(lines, index, columns))
		.filter((write) => write !== null);
}

/** The write opening on this line, or null when none does or it names no column. */
function writeAt(lines, index, columns) {
	// Anchored on the line's indent rather than on the call, so a short chain the
	// formatter left on one line — `trx.updateTable('x').set({ address_id: y })` —
	// is read as well as the broken-out form.
	const opened = /^(\t*).*?\.(values|set)\(/.exec(lines[index]);
	if (opened === null) {
		return null;
	}

	const body = bodyOf(lines, index, opened[1].length);
	const named = namedColumns([lines[index], ...body], columns);
	return named.length === 0
		? null
		: {
				kind: opened[2] === 'values' ? 'insert' : 'update',
				line: index + 1,
				columns: named,
				// The wrap sits either on the opening line or on the first line of the
				// object, depending on where the formatter broke the call.
				gated: [lines[index], body[0]].some(isGated),
			};
}

/** The lines indented deeper than the one that opened the write. */
function bodyOf(lines, openedAt, indent) {
	const end = lines
		.slice(openedAt + 1)
		.findIndex((line) => line.trim() !== '' && indentOf(line) <= indent);
	return lines.slice(openedAt + 1, end === -1 ? undefined : openedAt + 1 + end);
}

function indentOf(line) {
	return /^\t*/.exec(line)[0].length;
}

/** A gated write opens `await checkedValues(` where its object would be. */
function isGated(line) {
	return line !== undefined && /^\s*(?:\.(?:values|set)\()?await checkedValues\(/.test(line);
}

/** The reference columns these lines name as keys. */
function namedColumns(lines, columns) {
	const keys = lines.flatMap((line) =>
		[...line.matchAll(/(?:^|[\s{])([a-z][a-z0-9_]*):/g)].map(([, key]) => key),
	);
	return [...new Set(keys.filter((key) => columns.has(key)))];
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(failures, columnCount) {
	if (failures.length > 0) {
		console.error(`check-write-references: ${failures.length} problem(s).\n`);
		for (const failure of failures) {
			console.error(`  ${failure}`);
		}
		process.exit(1);
	}
	console.log(`check-write-references: every reference write is gated (${columnCount} columns).`);
}

main();
