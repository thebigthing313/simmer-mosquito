/**
 * Every intent a table declares must be one its writer actually handles.
 *
 * The two halves of a table are declared apart: `table-commands/*.ts` says which
 * commands the route accepts, and the domain module's `write*Command` says which
 * ones it knows how to write. Nothing made them agree, and the gap is invisible —
 * the intent map compiles, the route registers, the permission check passes, the
 * builder runs, and the write falls through the writer's `switch` to
 * `throw new Error('Unsupported … command')`. The caller gets a 500 with no
 * indication of which half is wrong.
 *
 * `missionDispatch.moveMissionItems` is the case this was written for. It is a
 * command on the `missions` table — `position` belongs to the sequence, so a move
 * renumbers every stop and answers with the mission — while the renumbering
 * itself lives beside the stop writes in `mission-items.ts`. The route accepted
 * it and `writeMissionCommand` had never heard of it.
 *
 * ## How a writer is asked without a database
 *
 * By calling it with a transaction that refuses every access. A writer that
 * handles the command reaches for the database and gets that refusal; one that
 * does not throws `Unsupported` *before* touching anything. So the distinction is
 * "which error", not "did it throw" — every one of these calls throws.
 *
 * The command is built by hand rather than through its domain builder, because a
 * builder would reject the empty payload long before the writer saw the type.
 * Only `command.type` decides which branch runs, which is exactly what is under
 * test.
 */

import { describe, expect, it } from 'vitest';
import type { WritableCommand } from '../../../command-write.js';
import { tableCommandSpecs } from '../../../table-commands/index.js';

/** What a writer touches the moment it knows what to do. */
const REACHED_THE_DATABASE = 'reached-the-database';

/**
 * A transaction that answers every question by refusing.
 *
 * A Proxy rather than a stub, so it does not have to anticipate which of Kysely's
 * builders a given writer starts with.
 */
const refusingTransaction = new Proxy(
	{},
	{
		get() {
			throw new Error(REACHED_THE_DATABASE);
		},
	},
);

interface WriterSpec {
	readonly table: string;
	readonly intents: Readonly<Record<string, unknown>>;
	readonly run: {
		readonly write: (trx: never, command: never) => Promise<unknown>;
	};
}

const specs = tableCommandSpecs(undefined as never) as unknown as readonly WriterSpec[];

/** Every (table, intent) pair on the surface, as test cases. */
const pairs = specs.flatMap((spec) =>
	Object.keys(spec.intents).map((intent) => ({ table: spec.table, intent, write: spec.run.write })),
);

describe('table command writer coverage', () => {
	it('has something to check', () => {
		// A guard on the guard: if the spec list ever comes back empty, every case
		// below would pass by not existing.
		expect(pairs.length).toBeGreaterThan(100);
	});

	it.each(pairs)('$table writes $intent', async ({ intent, write }) => {
		const command = { type: intent, payload: {} } as unknown as WritableCommand;

		const error = await write(refusingTransaction as never, command as never).then(
			() => null,
			(thrown: unknown) => (thrown instanceof Error ? thrown.message : String(thrown)),
		);

		// Anything but the fall-through means the writer knows this command: it
		// either reached for the database or tripped over the empty payload on the
		// way. Both prove the branch exists, which is all this can prove without
		// one.
		expect(error).not.toMatch(/^Unsupported /);
	});
});
