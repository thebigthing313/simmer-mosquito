#!/usr/bin/env node
/**
 * Holds the two registers that say which columns the server owns to each other.
 *
 * "Who writes this column" is written down twice, on the two sides of the wire:
 *
 * - `SERVER_OWNED` in `scripts/generate-table-types.mjs` is the server's answer.
 *   The generator widens it per table out of the schema dump and emits
 *   `ServerOwnedColumns` in `packages/db/src/tables.ts`, which `CommandPayload`
 *   subtracts, so a handler reading one off a body fails `tsc` naming the
 *   column. `pnpm check:table-types` is what holds that half to the dump.
 * - `serverOwnedColumns` in
 *   `packages/sync/src/collections/functions/command-request.ts` is the
 *   client's. It is one hand-written list, stripped from every outgoing body on
 *   both write paths.
 *
 * Nothing compared them, and they had drifted in both directions by the time
 * anyone looked (#648). The failure mode is the one the client list exists to
 * prevent: a migration adds a server-computed column, the generator learns about
 * it the day the migration lands because it reads the dump, and the client keeps
 * sending it because a person has to edit a literal. An edit form stamps it
 * optimistically, an unmodified record produces a non-empty diff, and a save
 * that changed nothing becomes a request the server writes over.
 *
 * ## Why this is not an equality check
 *
 * The two lists are not meant to be the same list, and saying so is most of the
 * value here. Each difference is answered by a third register rather than by
 * prose, so the gate can check the answer instead of trusting it:
 *
 * - A name the client strips and the server does not own unconditionally is
 *   allowed when `TRIGGER_MAINTAINED` names it. `lat`, `lng` and `geom_type` are
 *   on the server's answer only where the `set_owned_centroid()` trigger fires,
 *   and stripping them everywhere costs nothing: a table without the trigger has
 *   no such column for a row to carry.
 * - A name the server owns and the client does not strip is allowed when `OMIT`
 *   in `scripts/generate-table-schemas.mjs` names it. That is the register of
 *   columns no client receives on any table, so `geom` and `deleted_at` are not
 *   values a row schema holds and a body built from a row cannot name one.
 *
 * A name in neither fails, which is what makes the next column added to one side
 * a failing branch rather than a stale literal.
 *
 * ## The floors
 *
 * Four registers are read out of source, so four ways exist for this to pass
 * over nothing. Each is floored and fails below it, the rule #591 and #599
 * established: a register that has been emptied, or a parse that has stopped
 * matching, must fail rather than report a quiet zero.
 *
 * Run it with `pnpm check:server-owned-columns`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The four registers, and the file each is read out of. */
const REGISTERS = [
	{
		name: 'SERVER_OWNED',
		file: 'scripts/generate-table-types.mjs',
		declaration: 'SERVER_OWNED',
		minimum: 7,
	},
	{
		name: 'TRIGGER_MAINTAINED',
		file: 'scripts/generate-table-types.mjs',
		declaration: 'TRIGGER_MAINTAINED',
		minimum: 3,
	},
	{
		name: 'OMIT',
		file: 'scripts/generate-table-schemas.mjs',
		declaration: 'OMIT',
		minimum: 4,
	},
	{
		name: 'serverOwnedColumns',
		file: 'packages/sync/src/collections/functions/command-request.ts',
		declaration: 'serverOwnedColumns',
		minimum: 8,
	},
];

/**
 * Differences the two lists are allowed to carry for a reason neither register
 * answers.
 *
 * Empty, and empty on purpose. Both of today's differences are answered by
 * `TRIGGER_MAINTAINED` and `OMIT`, which are registers a person edits when the
 * fact changes, so writing them out here again would be a third copy of what
 * those two already say. The mechanism ships anyway, because the next difference
 * may have no register behind it, and an exemption with a reason beats a name
 * quietly dropped from a list.
 *
 * An entry is `{ name, side, reason }`, where `side` is `'server'` for a name
 * `SERVER_OWNED` holds and the client does not strip, and `'client'` for the
 * other direction. An entry matching nothing fails, so it cannot rot into
 * headroom the next real difference lands inside.
 */
const EXCEPTIONS = [];

const SIDES = ['server', 'client'];

function main() {
	const registers = new Map(REGISTERS.map((register) => [register.name, readRegister(register)]));

	const serverOwned = registers.get('SERVER_OWNED');
	const triggerMaintained = registers.get('TRIGGER_MAINTAINED');
	const omitted = registers.get('OMIT');
	const stripped = registers.get('serverOwnedColumns');

	const failures = [
		...checkExceptionSides(),
		...checkServerNamesAreStripped(serverOwned, omitted, stripped),
		...checkStrippedNamesAreOwned(serverOwned, triggerMaintained, stripped),
		...checkNoStaleExceptions(serverOwned, triggerMaintained, omitted, stripped),
	];

	if (failures.length > 0) {
		console.error('Server-owned column check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		console.error(
			'\nThe server owns SERVER_OWNED (scripts/generate-table-types.mjs); the client strips',
		);
		console.error(
			'serverOwnedColumns (packages/sync/src/collections/functions/command-request.ts).',
		);
		console.error('Put the name on the other side, or write down why it belongs on one only.');
		process.exitCode = 1;
		return;
	}

	console.log(
		`Server-owned columns: ${serverOwned.size} owned by name, ${stripped.size} stripped on the ` +
			`way out, ${EXCEPTIONS.length} exceptions.`,
	);
}

/**
 * The names in one `new Set([...])` declaration.
 *
 * Read out of source rather than imported, for two reasons. The generators are
 * scripts with no exports, and `packages/sync` must not gain an import that
 * reaches the workspace's node-only half.
 */
function readRegister({ name, file, declaration, minimum }) {
	const path = join(workspaceRoot, file);
	const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

	// Anchored on the declaration rather than on the name, because all four
	// registers are named in prose above themselves and a loose match would read
	// a docblock.
	const match = source.match(
		new RegExp(`^const ${declaration}(?::[^=]*)? = new Set\\(\\[([\\s\\S]*?)\\]\\)`, 'm'),
	);
	if (match === null) {
		throw new Error(`Could not find the ${declaration} set in ${file}.`);
	}

	const names = new Set([...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((entry) => entry[1]));

	if (names.size < minimum) {
		throw new Error(
			`${name} holds ${names.size} names (${[...names].join(', ')}), fewer than the ${minimum} ` +
				`this expects. Either a name has been dropped from ${file} and this gate has stopped ` +
				'checking it, or the parse has stopped matching and every answer below is over nothing. ' +
				`Lower the floor in scripts/check-server-owned-columns.mjs only alongside the edit that ` +
				'shrank the register.',
		);
	}

	return names;
}

/** An exception naming a side that is not a side excuses nothing and says nothing. */
function checkExceptionSides() {
	return EXCEPTIONS.filter((exception) => !SIDES.includes(exception.side)).map(
		(exception) =>
			`the exception for ${exception.name} names side '${exception.side}', which is not ` +
			`${SIDES.join(' or ')}.`,
	);
}

/**
 * Every name the server owns unconditionally is stripped on the way out, kept
 * off every client by `OMIT`, or excused.
 */
function checkServerNamesAreStripped(serverOwned, omitted, stripped) {
	const excused = new Set(
		EXCEPTIONS.filter((exception) => exception.side === 'server').map(
			(exception) => exception.name,
		),
	);

	return [...serverOwned]
		.filter((name) => !(stripped.has(name) || omitted.has(name) || excused.has(name)))
		.sort()
		.map(
			(name) =>
				`SERVER_OWNED names ${name} and the client does not strip it. A client value for it ` +
				'would ride out in a body and read as an intention the server overwrites.',
		);
}

/**
 * Every name the client strips is one the server owns, one the centroid trigger
 * writes, or excused.
 */
function checkStrippedNamesAreOwned(serverOwned, triggerMaintained, stripped) {
	const excused = new Set(
		EXCEPTIONS.filter((exception) => exception.side === 'client').map(
			(exception) => exception.name,
		),
	);

	return [...stripped]
		.filter((name) => !(serverOwned.has(name) || triggerMaintained.has(name) || excused.has(name)))
		.sort()
		.map(
			(name) =>
				`the client strips ${name} and nothing says the server owns it. A column a write may ` +
				'set is being dropped from every body, so the value never reaches the handler.',
		);
}

/** A server-side exception is spent once the name is owned, stripped or omitted as it should be. */
function serverExceptionIsSpent(name, serverOwned, omitted, stripped) {
	return !serverOwned.has(name) || stripped.has(name) || omitted.has(name);
}

/** A client-side exception is spent once the strip list and the two owning registers agree. */
function clientExceptionIsSpent(name, serverOwned, triggerMaintained, stripped) {
	return !stripped.has(name) || serverOwned.has(name) || triggerMaintained.has(name);
}

/** An exception that excuses nothing is headroom the next real difference lands in. */
function checkNoStaleExceptions(serverOwned, triggerMaintained, omitted, stripped) {
	return EXCEPTIONS.filter((exception) =>
		exception.side === 'server'
			? serverExceptionIsSpent(exception.name, serverOwned, omitted, stripped)
			: clientExceptionIsSpent(exception.name, serverOwned, triggerMaintained, stripped),
	).map(
		(exception) =>
			`the ${exception.side} exception for ${exception.name} excuses nothing: the two registers ` +
			'already agree about it. Delete it.',
	);
}

main();
