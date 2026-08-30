#!/usr/bin/env node
/**
 * Asserts that every acknowledgement a command payload carries is in the
 * vocabulary, that something has been recorded as checking it, and that the
 * count of the ones nothing checks has not risen.
 *
 * An acknowledgement is a flag a client sets to say "yes, I meant to remove
 * that". #165 found seventy-three of them declared on command payloads,
 * normalized by the domain builders, carried into the write transaction, and
 * read by nothing: a client that withheld one got the write anyway. #314 fixed
 * the fourteen that ride on the delete registry and #317 the rest of the
 * reachable ones, but neither fixes the shape that let it happen. A flag is
 * declared on the payload that needs it, which is right, and that shape cannot
 * say how many there are or whether anything reads them.
 *
 * So this is the count. Three files have to agree:
 *
 * - `packages/domain/src/acknowledgements.ts` lists the vocabulary.
 * - every other module under `packages/domain/src` declares the flags on
 *   payloads, and those names must be exactly the vocabulary.
 * - `apps/server/src/acknowledgements.ts` maps each name to the mechanism that
 *   reads it, or to `unchecked` with the issue that will settle it.
 *
 * Run it with `pnpm check:acknowledgements`.
 *
 * ## The ratchet
 *
 * `UNCHECKED_ACKNOWLEDGEMENTS` in the server map is the number of `unchecked`
 * entries, checked in. This fails when the real count differs in either
 * direction. Up means a branch added a flag nothing reads without saying so.
 * Down means a branch guarded one and left the number behind, which is worth a
 * failure too: the falling number is the progress bar, and a number nobody
 * maintains stops being one.
 *
 * Same idea as the duplication threshold in `.fallowrc.jsonc` and the complexity
 * baseline in `.fallow-baseline/`, and the same caution applies. Lowering it is
 * normal. Raising it needs a reason in the commit message.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOCABULARY_FILE = join(workspaceRoot, 'packages/domain/src/acknowledgements.ts');
const MAP_FILE = join(workspaceRoot, 'apps/server/src/acknowledgements.ts');
const PAYLOAD_ROOT = join(workspaceRoot, 'packages/domain/src');
const SKIP_DIRS = new Set(['tests', 'dist', 'node_modules']);
const NAME = /acknowledged[A-Za-z]+/g;

function main() {
	const vocabulary = readVocabulary();
	const onPayloads = readPayloadNames();
	const { mechanisms, declaredUnchecked } = readMap();

	const failures = [
		...missing(onPayloads, vocabulary, 'on a command payload but not in the vocabulary'),
		...missing(vocabulary, onPayloads, 'in the vocabulary but on no command payload'),
		...missing(vocabulary, mechanisms, 'in the vocabulary but not in ACKNOWLEDGEMENT_MECHANISMS'),
		...missing(mechanisms, vocabulary, 'in ACKNOWLEDGEMENT_MECHANISMS but not in the vocabulary'),
	];

	const unchecked = countUnchecked();
	if (unchecked !== declaredUnchecked) {
		failures.push(
			unchecked > declaredUnchecked
				? `UNCHECKED_ACKNOWLEDGEMENTS says ${declaredUnchecked}, but ${unchecked} entries are unchecked. A flag nothing reads was added; guard it or raise the number and say why.`
				: `UNCHECKED_ACKNOWLEDGEMENTS says ${declaredUnchecked}, but only ${unchecked} entries are unchecked. Lower it to ${unchecked}.`,
		);
	}

	report(failures, vocabulary.size, unchecked);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The names between `ACKNOWLEDGEMENTS = [` and its `] as const`. */
function readVocabulary() {
	const source = readFileSync(VOCABULARY_FILE, 'utf8');
	const list = /export const ACKNOWLEDGEMENTS = \[([\s\S]*?)\] as const;/.exec(source);
	if (list === null) {
		fail('packages/domain/src/acknowledgements.ts no longer declares ACKNOWLEDGEMENTS.');
	}
	return new Set(list[1].match(NAME) ?? []);
}

/**
 * Every `acknowledged*` identifier the domain package uses, minus the
 * vocabulary file itself.
 *
 * Reading identifiers rather than parsing the payload types is deliberate: a
 * flag is named in an input interface, a payload type, and the builder that
 * normalizes it, and any of the three is enough to prove it exists. A name that
 * appears only in a comment counts too, which is the conservative direction —
 * it fails the gate rather than hiding a flag.
 */
function readPayloadNames() {
	return new Set(
		sourceFiles(PAYLOAD_ROOT)
			.filter((file) => file !== VOCABULARY_FILE)
			.flatMap((file) => readFileSync(file, 'utf8').match(NAME) ?? []),
	);
}

/** The map's keys, and the count it declares. */
function readMap() {
	const source = readFileSync(MAP_FILE, 'utf8');
	const body = /ACKNOWLEDGEMENT_MECHANISMS: Record<[^>]*> = \{([\s\S]*?)\n\};/.exec(source);
	if (body === null) {
		fail('apps/server/src/acknowledgements.ts no longer declares ACKNOWLEDGEMENT_MECHANISMS.');
	}
	const count = /export const UNCHECKED_ACKNOWLEDGEMENTS = (\d+);/.exec(source);
	if (count === null) {
		fail('apps/server/src/acknowledgements.ts no longer declares UNCHECKED_ACKNOWLEDGEMENTS.');
	}
	const keys = new Set(
		[...body[1].matchAll(/^\t(acknowledged[A-Za-z]+):/gm)].map(([, key]) => key),
	);
	return { mechanisms: keys, declaredUnchecked: Number.parseInt(count[1], 10) };
}

/** How many entries answer `unchecked(...)`. */
function countUnchecked() {
	const source = readFileSync(MAP_FILE, 'utf8');
	const body = /ACKNOWLEDGEMENT_MECHANISMS: Record<[^>]*> = \{([\s\S]*?)\n\};/.exec(source);
	return [...body[1].matchAll(/^\t(?:acknowledged[A-Za-z]+): unchecked\(/gm)].length;
}

/** Every `.ts` file under a directory, skipping tests and build output. */
function sourceFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path);
		}
		return entry.name.endsWith('.ts') ? [path] : [];
	});
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function missing(from, against, reason) {
	return [...from].filter((name) => !against.has(name)).map((name) => `${name} is ${reason}.`);
}

function fail(message) {
	console.error(`check-acknowledgements: ${message}`);
	process.exit(1);
}

function report(failures, total, unchecked) {
	if (failures.length > 0) {
		console.error(`check-acknowledgements: ${failures.length} problem(s).\n`);
		for (const failure of failures) {
			console.error(`  ${failure}`);
		}
		process.exit(1);
	}
	console.log(
		`check-acknowledgements: ${total} acknowledgements, ${total - unchecked} checked, ${unchecked} not yet.`,
	);
}

main();
