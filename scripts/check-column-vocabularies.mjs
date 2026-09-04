#!/usr/bin/env node
/**
 * Holds every Postgres enum type to one register.
 *
 * The seventeen enum types are declared once, in `COLUMN_VOCABULARIES`
 * (`packages/domain/src/column-vocabularies.ts`). Larval Density alone was
 * written out in thirteen places before #432, none held to any other, and a
 * sixth band would have compiled in all thirteen. This is what stops a
 * fourteenth being written.
 *
 * Four assertions, over TypeScript source and the schema dump, with no database:
 *
 * 1. **The register is well formed.** Each entry is an `as const` array with a
 *    type derived from it, and `COLUMN_VOCABULARIES` names each array exactly
 *    once. A member list with no derived type is a list the compiler cannot
 *    narrow against.
 * 2. **The register is the database's.** Same type names, same members, same
 *    order, compared against `packages/db/schema.sql`. Order matters because it
 *    is what lets a surface read `none, light, medium, heavy, very_heavy` off
 *    the register instead of writing a second list.
 * 3. **The generated row schemas agree.** A `z.enum([...])` in
 *    `packages/sync/src/collections/tables/` whose members are a register
 *    entry's must be that entry, in order. `packages/sync` cannot import
 *    `packages/domain` (ADR 0007), so its copy is generated rather than deleted,
 *    and this is what holds the generator's output to the source it came from.
 * 4. **Nobody else writes a member list.** An array literal or a type union
 *    whose string members cover a whole register entry is a copy, wherever it
 *    hides and whatever it is called.
 *
 * Assertion 4 matches by members rather than by name, so an unrelated union is
 * invisible and a renamed copy is not. It is written against array literals and
 * type unions on purpose. That catches the Mapbox `match` expression the
 * inspection tiles built by hand, which is an array of five density words
 * interleaved with colours and which nothing type-checked. It leaves
 * `INSPECTION_DENSITY_COLORS` alone, because a `Record<LarvalDensity, string>`
 * is already held to the union by the compiler and rewriting it to satisfy a
 * gate would lose that.
 *
 * Say plainly what it does not catch: a chain of `===` comparisons. #432 deleted
 * the two that existed by hand. The gate is not asked to catch every shape a
 * copy can take.
 *
 * Gated at zero, with no allowance list and no per-file escape hatch. A file
 * that wants an exemption is a file that wants a copy. Generated source and test
 * fixtures are skipped, per #418: a fixture spelling out a list as input data is
 * the input, not a second declaration.
 *
 * Run it with `pnpm check:column-vocabularies`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFiles } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER_SOURCE = join(workspaceRoot, 'packages/domain/src/column-vocabularies.ts');
const SCHEMA_FILE = join(workspaceRoot, 'packages/db/schema.sql');
const ROW_SCHEMAS = join(workspaceRoot, 'packages/sync/src/collections/tables');

/** Generated source, which nobody edits and which owes nothing to the register. */
const GENERATED_PATHS = [
	join('packages', 'ui-web', 'src', 'components', 'ui'),
	join('packages', 'sync', 'src', 'collections', 'tables'),
];

/** An array literal of two or more plain string literals. */
const ARRAY_LITERAL = /\[\s*(?:'[^']*'|"[^"]*")\s*(?:,\s*(?:'[^']*'|"[^"]*")\s*)+,?\s*\]/g;
/** A union of two or more string literal types. Greedy, so it reads the whole union. */
const UNION_TYPE = /'[^']*'(?:\s*\|\s*'[^']*')+/g;
/** Every string literal in a file, for the interleaved rule. */
const STRING_LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;

/**
 * The smallest register entry the interleaved rule will look for.
 *
 * A list and an interleaved run are told apart by their punctuation, so the
 * interleaved rule can only ask "are these n words adjacent". Two adjacent words
 * is a coincidence: `route_type` is `habitat, trap`, and `MapFeatureKind`,
 * `CommentTargetType`, `DeletableRecordType` and `OwnedGeometryKind` all open
 * with those two names and are none of them a Route. Three is not a
 * coincidence, and the interleaved copy this rule exists for holds five.
 */
const INTERLEAVED_FLOOR = 3;

/** The brackets `enclosingBracket` counts, opening and closing. */
const OPENERS = '([{';
const CLOSERS = ')]}';

function main() {
	const register = readRegister();
	const failures = [
		...checkRegisterShape(register),
		...checkAgainstSchema(register),
		...checkRowSchemas(register),
		...checkNoCopies(register),
	];

	if (failures.length > 0) {
		console.error('Column vocabulary check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		console.error(
			'\nEvery Postgres enum type is declared once, in COLUMN_VOCABULARIES ' +
				'(packages/domain/src/column-vocabularies.ts).',
		);
		console.error(
			'Read the list off it, or derive a subset from it, rather than writing it again.',
		);
		process.exitCode = 1;
		return;
	}

	const total = [...register.entries.values()].reduce((sum, members) => sum + members.length, 0);
	console.log(
		`Column vocabularies: ${register.entries.size} enum types over ${total} members, no copies.`,
	);
}

// ---------------------------------------------------------------------------
// Reading the register.
// ---------------------------------------------------------------------------

/**
 * The arrays, the derived types, and the `COLUMN_VOCABULARIES` map.
 *
 * Regex over TypeScript, like every other generator here. The shape assertion
 * below is what makes that safe: a declaration this cannot parse is a
 * declaration it reports as missing rather than one it passes over.
 */
function readRegister() {
	const source = readFileSync(REGISTER_SOURCE, 'utf8').replace(/\r\n/g, '\n');

	const arrays = new Map();
	for (const match of source.matchAll(/^export const ([A-Z0-9_]+) = (\[[^\]]*\]) as const;$/gm)) {
		arrays.set(
			match[1],
			[...match[2].matchAll(/'([^']*)'/g)].map((member) => member[1]),
		);
	}

	const derivedTypes = new Set(
		[...source.matchAll(/^export type (\w+) = \(typeof ([A-Z0-9_]+)\)\[number\];$/gm)].map(
			(match) => match[2],
		),
	);

	const mapMatch = source.match(/export const COLUMN_VOCABULARIES = \{([\s\S]*?)\n\} as const/);
	if (mapMatch === null) {
		throw new Error(`Could not find COLUMN_VOCABULARIES in ${REGISTER_SOURCE}.`);
	}
	const entries = new Map(
		[...mapMatch[1].matchAll(/^\t(\w+): ([A-Z0-9_]+),$/gm)].map((match) => [
			match[1],
			arrays.get(match[2]) ?? [],
		]),
	);
	const named = [...mapMatch[1].matchAll(/^\t\w+: ([A-Z0-9_]+),$/gm)].map((match) => match[1]);

	return { arrays, derivedTypes, entries, named };
}

function* checkRegisterShape(register) {
	yield* checkEveryArrayIsRegistered(register);
	yield* checkEveryRegistrationIsDeclared(register);
}

/** Each `as const` array has a type derived from it and a place in the map. */
function* checkEveryArrayIsRegistered({ arrays, derivedTypes, named }) {
	for (const name of arrays.keys()) {
		if (!derivedTypes.has(name)) {
			yield `${name} has no \`export type X = (typeof ${name})[number];\` beside it.`;
		}
		if (!named.includes(name)) {
			yield `${name} is declared and COLUMN_VOCABULARIES does not name it.`;
		}
	}
}

/** Each name in the map is declared above it, once, and parsed to something. */
function* checkEveryRegistrationIsDeclared({ arrays, entries, named }) {
	for (const [name, count] of countBy(named)) {
		if (!arrays.has(name)) {
			yield `COLUMN_VOCABULARIES names ${name}, which the register does not declare.`;
		}
		if (count > 1) {
			yield `COLUMN_VOCABULARIES names ${name} ${count} times.`;
		}
	}

	for (const [type, members] of entries) {
		if (members.length === 0) {
			yield `${type} resolves to no members, so the register did not parse.`;
		}
	}
}

// ---------------------------------------------------------------------------
// The database's half, read from the dump.
// ---------------------------------------------------------------------------

/**
 * `packages/db/schema.sql` rather than the migration text.
 *
 * The dump is the realised schema, and pg_dump writes an enum's members in
 * `enumsortorder`. Parsing `create type` out of the migrations answers with the
 * rollback half instead: `202605140001` renames `notification_channel`, creates
 * a three-member one, and its `-- migrate:down` restores the four-member one.
 * That is the third time this repo has paid for reading migration text, after
 * #123.
 */
function checkAgainstSchema({ entries }) {
	const sql = readFileSync(SCHEMA_FILE, 'utf8').replace(/\r\n/g, '\n');
	const database = new Map(
		[...sql.matchAll(/^CREATE TYPE public\.(\w+) AS ENUM \(\n([\s\S]*?)^\);$/gm)].map((match) => [
			match[1],
			[...match[2].matchAll(/'([^']*)'/g)].map((member) => member[1]),
		]),
	);

	const failures = [];

	for (const [type, members] of database) {
		const registered = entries.get(type);
		if (registered === undefined) {
			failures.push(`The database has an enum type \`${type}\` the register does not name.`);
			continue;
		}
		if (registered.join('|') !== members.join('|')) {
			failures.push(
				`\`${type}\` is [${members.join(', ')}] in the database and ` +
					`[${registered.join(', ')}] in the register.`,
			);
		}
	}
	for (const type of entries.keys()) {
		if (!database.has(type)) {
			failures.push(`The register names \`${type}\`, which is not an enum type in the database.`);
		}
	}

	return failures;
}

// ---------------------------------------------------------------------------
// The generated row schemas.
// ---------------------------------------------------------------------------

function checkRowSchemas({ entries }) {
	const failures = [];
	const byMembers = new Map(
		[...entries].map(([type, members]) => [[...members].sort().join('|'), { type, members }]),
	);

	for (const file of readdirSync(ROW_SCHEMAS)) {
		if (!file.endsWith('.ts')) {
			continue;
		}
		const source = readFileSync(join(ROW_SCHEMAS, file), 'utf8').replace(/\r\n/g, '\n');
		for (const match of source.matchAll(/z\.enum\((\[[^\]]*\])\)/g)) {
			const members = [...match[1].matchAll(/'([^']*)'/g)].map((member) => member[1]);
			const entry = byMembers.get([...members].sort().join('|'));
			if (entry === undefined || entry.members.join('|') === members.join('|')) {
				continue;
			}
			failures.push(
				`packages/sync/src/collections/tables/${file}:${lineOf(source, match.index)} ` +
					`writes \`${entry.type}\` as [${members.join(', ')}], and the register orders it ` +
					`[${entry.members.join(', ')}]. Regenerate: pnpm generate:schemas --write`,
			);
		}
	}

	return failures;
}

// ---------------------------------------------------------------------------
// Copies.
// ---------------------------------------------------------------------------

function checkNoCopies({ entries }) {
	const byMembers = new Map([...entries].map(([type, members]) => [key(members), type]));
	const failures = [];

	for (const file of sourceFiles(workspaceRoot, GENERATED_PATHS)) {
		if (file === REGISTER_SOURCE) {
			continue;
		}
		const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
		const where = relative(workspaceRoot, file).split(sep).join('/');

		failures.push(...listCopies(source, where, byMembers));
		failures.push(...interleavedCopies(source, where, entries));
	}

	return failures;
}

/**
 * An array literal or a type union whose members are exactly a register entry's.
 *
 * Equality rather than a superset, which is what `check:geometry-policies` can
 * afford. `Point` and `MultiPolygon` are distinctive words; `habitat` and `trap`
 * are the two commonest nouns in this domain, and four unrelated polymorphic
 * target unions open with both. Under a superset rule `route_type` alone raised
 * twenty-four findings and one of them was a copy.
 */
function* listCopies(source, where, byMembers) {
	for (const pattern of [ARRAY_LITERAL, UNION_TYPE]) {
		for (const match of source.matchAll(pattern)) {
			const written = [...match[0].matchAll(/['"]([^'"]*)['"]/g)].map((member) => member[1]);
			const type = byMembers.get(key(written));
			if (type !== undefined) {
				yield `${where}:${lineOf(source, match.index)} writes \`${type}\` out as a list.`;
			}
		}
	}
}

/**
 * A register entry's members written out one arm at a time, in one of two
 * shapes that no list pattern reads as a list.
 *
 * A **comparison chain** is `value === 'none' || value === 'light' || …`, which
 * `readDensity` and four others were. A **bracketed run** is a flat array with
 * something other than a string between the members, which is the Mapbox `match`
 * expression the inspection tiles built by hand: five density words interleaved
 * with colour identifiers, type-checked by nothing, where a missing arm renders
 * the fallback colour and reports it nowhere.
 *
 * Two shapes rather than "the members are adjacent", because adjacency alone
 * flags a `switch` over the column and an object literal keyed by something else
 * whose values happen to be the members. Both of those are held to the union by
 * the compiler already, which is the same reason `INSPECTION_DENSITY_COLORS`
 * stays as it is.
 */
function* interleavedCopies(source, where, entries) {
	const literals = [...source.matchAll(STRING_LITERAL)].map((match) => ({
		value: match[1] ?? match[2],
		index: match.index,
	}));

	for (const [type, members] of entries) {
		if (members.length < INTERLEAVED_FLOOR) {
			continue;
		}
		for (const window of runsOf(literals, members)) {
			const shape = interleavedShape(source, window);
			if (shape !== null) {
				yield `${where}:${lineOf(source, window[0].index)} spells \`${type}\` out ${shape}.`;
			}
		}
	}
}

/** Every window of consecutive string literals holding each member exactly once. */
function* runsOf(literals, members) {
	const wanted = key(members);

	for (let start = 0; start + members.length <= literals.length; start += 1) {
		const window = literals.slice(start, start + members.length);
		if (key(window.map((literal) => literal.value)) === wanted) {
			yield window;
			start += members.length - 1;
		}
	}
}

/** Which of the two shapes a run is, or `null` when it is neither. */
function interleavedShape(source, window) {
	if (window.every((literal) => /(?:===|!==)\s*$/.test(source.slice(0, literal.index)))) {
		return 'one comparison at a time';
	}

	const span = source.slice(window[0].index, window.at(-1).index);
	const between = span.replace(/'[^']*'|"[^"]*"/g, '');

	// A run with only punctuation between its members is a list, and `listCopies`
	// has already reported it as one.
	if (!/[A-Za-z_$]/.test(between) || /[;{}]/.test(between)) {
		return null;
	}

	return enclosingBracket(source, window[0].index) === '[' ? 'arm by arm inside an array' : null;
}

/**
 * The bracket the given position sits directly inside, scanning backwards.
 *
 * `[` says the run is inside an array literal. Anything else, or nothing, says
 * it is an object's values, a call's arguments, or a `case` label, and each of
 * those is already held to the column's type by the compiler.
 */
function enclosingBracket(source, index) {
	let depth = 0;

	for (let at = index - 1; at >= 0; at -= 1) {
		const character = source[at];

		if (CLOSERS.includes(character)) {
			depth += 1;
		} else if (OPENERS.includes(character)) {
			if (depth === 0) {
				return character;
			}
			depth -= 1;
		}
	}

	return null;
}

/** A member set, order-insensitive, for comparing one list against another. */
function key(members) {
	return [...new Set(members)].sort().join(' ');
}

// ---------------------------------------------------------------------------

function countBy(values) {
	const counts = new Map();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}

function lineOf(source, index) {
	return source.slice(0, index).split('\n').length;
}

main();
