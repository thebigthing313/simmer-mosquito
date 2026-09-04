#!/usr/bin/env node
/**
 * Holds the geometry matrix to one register.
 *
 * Which record kind stores which shapes is written once, in
 * `OWNED_GEOMETRY_POLICIES` (`packages/domain/src/shared.ts`). It used to be
 * written in seven places, none of which was held to any other, and #418 found
 * three the ticket had not listed. Four of the seven were deleted; this is what
 * stops a fifth being written.
 *
 * Three structural assertions, in pure TypeScript source, with no database:
 *
 * 1. **Every owned geometry kind has exactly one policy row.** A kind with no
 *    row throws at run time on the first write that names it; a kind with two
 *    rows answers with whichever came first, silently.
 * 2. **No table name appears on two rows.** Two rows naming one table are two
 *    answers for one column, and the CHECK on that column can only match one.
 * 3. **No file outside the register writes a geometry-type list.** This is the
 *    one that catches a new copy. A list is either an array literal holding two
 *    or more geometry-type names, or one expression comparing a value against
 *    two or more of them, which is the shape the three deleted inline guards
 *    had.
 *
 * Gated at zero, with no allowance list and no per-file escape hatch. A file
 * that wants an exemption is a file that wants a copy. `check:acknowledgements`
 * ratchets because it inherited 73 unchecked names; this matrix has no backlog,
 * because the seven copies agreed on the day they were collapsed.
 *
 * Two shapes are deliberately not lists. A **type union** of geometry names is a
 * type declaration, and `packages/domain` and `packages/mapping` are meant to
 * hold structurally identical ones (ADR 0018 says why the copy stays). An
 * **object keyed by a geometry-type union** is held to that union by the
 * compiler, so it cannot drift the way a hand-written list can.
 *
 * The database half is not here. Reading the CHECKs statically means folding
 * `add constraint`, `drop constraint` and `alter column type` across migration
 * files in order, which is a small SQL interpreter, and #123 already paid for
 * parsing migration text. It is a case in
 * `packages/db/src/tests/integration/owned-geometry.integration.test.ts`, which
 * reads the column type and the constraint back out of the catalog.
 *
 * Run it with `pnpm check:geometry-policies`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFiles } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER_SOURCE = join(workspaceRoot, 'packages/domain/src/shared.ts');
const SCANNED_ROOTS = ['apps', 'packages'];

/**
 * The six OGC shapes, spelled the way GeoJSON spells them.
 *
 * Held here rather than read out of the register, so that widening the register
 * to the multi shapes does not also widen what the scan will tolerate.
 */
const GEOMETRY_TYPE_NAMES = [
	'Point',
	'LineString',
	'Polygon',
	'MultiPoint',
	'MultiLineString',
	'MultiPolygon',
];

/**
 * How many kinds and how many tables the register holds.
 *
 * Asserted rather than assumed. A parse that stops matching must fail, not pass
 * over nothing: a silent "nothing to check here" is the one failure mode a check
 * like this has. Both numbers move when the matrix does, and moving them is a
 * deliberate edit.
 */
const EXPECTED_KINDS = 12;
const EXPECTED_TABLES = 15;

/** Generated source, which nobody edits and which owes nothing to the register. */
const GENERATED_PATHS = [join('packages', 'ui-web', 'src', 'components', 'ui')];

const NAME_PATTERN = GEOMETRY_TYPE_NAMES.join('|');
/** An array literal of two or more plain string literals. */
const ARRAY_LITERAL = /\[\s*(?:'[^']*'|"[^"]*")\s*(?:,\s*(?:'[^']*'|"[^"]*")\s*)+,?\s*\]/g;
/** Two geometry-name comparisons joined into one expression. */
const COMPARISON_CHAIN = new RegExp(
	`(?:===|!==)\\s*'(?:${NAME_PATTERN})'[^;{}\\n]*?(?:\\|\\||&&)[^;{}\\n]*?(?:===|!==)\\s*'(?:${NAME_PATTERN})'`,
	'g',
);

function main() {
	const register = readRegister();
	const failures = [
		...checkOneRowPerKind(register),
		...checkTablesAreUnique(register),
		...checkNoCopies(),
	];

	if (failures.length > 0) {
		console.error('Geometry policy check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		console.error('\nThe matrix lives in OWNED_GEOMETRY_POLICIES (packages/domain/src/shared.ts).');
		console.error('Read a policy off it rather than writing the shapes out again.');
		process.exitCode = 1;
		return;
	}

	console.log(
		`Geometry policies: ${register.rows.length} kinds over ${EXPECTED_TABLES} tables, no copies.`,
	);
}

/** Read the kind union and the policy rows out of the register's source. */
function readRegister() {
	const source = readFileSync(REGISTER_SOURCE, 'utf8');

	const unionMatch = source.match(/export type OwnedGeometryKind =([\s\S]*?);/);
	if (unionMatch === null) {
		throw new Error(`Could not find the OwnedGeometryKind union in ${REGISTER_SOURCE}.`);
	}
	const kinds = [...unionMatch[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);

	const registerMatch = source.match(
		/export const OWNED_GEOMETRY_POLICIES = \[([\s\S]*?)\n\] as const/,
	);
	if (registerMatch === null) {
		throw new Error(`Could not find OWNED_GEOMETRY_POLICIES in ${REGISTER_SOURCE}.`);
	}
	const rows = [
		...registerMatch[1].matchAll(/kind:\s*'([A-Za-z]+)'[\s\S]*?tables:\s*\[([^\]]*)\]/g),
	].map((match) => ({
		kind: match[1],
		tables: [...match[2].matchAll(/'([a-z0-9_]+)'/g)].map((table) => table[1]),
	}));

	if (kinds.length !== EXPECTED_KINDS || rows.length !== EXPECTED_KINDS) {
		throw new Error(
			`Expected ${EXPECTED_KINDS} owned geometry kinds and ${EXPECTED_KINDS} policy rows, ` +
				`read ${kinds.length} and ${rows.length}. Update EXPECTED_KINDS if the matrix grew.`,
		);
	}
	const tableCount = rows.reduce((total, row) => total + row.tables.length, 0);
	if (tableCount !== EXPECTED_TABLES) {
		throw new Error(
			`Expected ${EXPECTED_TABLES} geometry tables, read ${tableCount}. ` +
				'Update EXPECTED_TABLES if the matrix grew.',
		);
	}

	return { kinds, rows };
}

function checkOneRowPerKind({ kinds, rows }) {
	const failures = [];
	const counts = new Map();
	for (const row of rows) {
		counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
	}
	for (const kind of kinds) {
		const count = counts.get(kind) ?? 0;
		if (count === 0) {
			failures.push(`${kind} has no policy row.`);
		} else if (count > 1) {
			failures.push(`${kind} has ${count} policy rows.`);
		}
	}
	for (const kind of counts.keys()) {
		if (!kinds.includes(kind)) {
			failures.push(`${kind} has a policy row but is not an OwnedGeometryKind.`);
		}
	}
	return failures;
}

function checkTablesAreUnique({ rows }) {
	const failures = [];
	const owners = new Map();
	for (const row of rows) {
		for (const table of row.tables) {
			owners.set(table, [...(owners.get(table) ?? []), row.kind]);
		}
	}
	for (const [table, kinds] of owners) {
		if (kinds.length > 1) {
			failures.push(`${table} is named by ${kinds.join(' and ')}.`);
		}
	}
	return failures;
}

function checkNoCopies() {
	const failures = [];
	for (const file of sourceFiles(workspaceRoot, GENERATED_PATHS)) {
		if (file === REGISTER_SOURCE) {
			continue;
		}
		const source = readFileSync(file, 'utf8');
		const where = relative(workspaceRoot, file).split(sep).join('/');

		for (const match of source.matchAll(ARRAY_LITERAL)) {
			const named = GEOMETRY_TYPE_NAMES.filter((name) =>
				new RegExp(`['"]${name}['"]`).test(match[0]),
			);
			if (named.length >= 2) {
				failures.push(`${where}:${lineOf(source, match.index)} writes ${match[0]}.`);
			}
		}
		for (const match of source.matchAll(COMPARISON_CHAIN)) {
			failures.push(
				`${where}:${lineOf(source, match.index)} compares against two geometry types by hand.`,
			);
		}
	}
	return failures;
}

function lineOf(source, index) {
	return source.slice(0, index).split('\n').length;
}

main();
