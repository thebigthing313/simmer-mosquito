import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandError } from './command-endpoint.js';
import type { OwnershipOutcome } from './command-ownership.js';
import type { CommandActor } from './command-permissions.js';

const resolveCommandOwnership = vi.hoisted(() => vi.fn());
vi.mock('./command-ownership.js', () => ({ resolveCommandOwnership }));
// The txid read is the one statement `writeCommands` issues itself; the write
// callback is the subject here, so stub the read rather than stand up a driver.
vi.mock('@simmer-mosquito/db', () => ({ readCurrentTransactionId: async () => 1 }));

const { writeCommands } = await import('./command-write.js');
type CommandDb = Parameters<typeof writeCommands>[0];

/**
 * The regression this whole change exists to prevent.
 *
 * `authorizeCommands` denies only on `'deny'`. A collector holding an
 * ownership-kind permission decides to `'ownership'` instead — deliberately,
 * because that rule can only be settled against the stored row, inside the
 * write transaction. So a command whose write loop skips the row check passes
 * the route boundary and is then checked nowhere: no compile error, no failing
 * test, and the symptom is a collector writing a record that is not theirs.
 *
 * Two of the seven families were in exactly that state, because their
 * `writeCommands` took no actor and so could not have checked. The commands
 * used below are `foundation.*` ones whose permission is a plain role floor,
 * which is the point: the guarantee has to hold for a family that has no
 * ownership-kind command *today*, so that adding one later cannot go unchecked.
 */

const actor: CommandActor = {
	role: 'collector',
	profileId: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
};

const commands = [
	{ type: 'foundation.createRegionFolder', payload: { id: 'one' } },
	{ type: 'foundation.updateRegionFolder', payload: { id: 'two' } },
] as const;

const ALLOWED: OwnershipOutcome = { kind: 'allowed' };

describe('writeCommands', () => {
	beforeEach(() => {
		resolveCommandOwnership.mockReset();
	});

	it('consults the ownership resolver for every command, not only the ones a handler remembers', async () => {
		resolveCommandOwnership.mockResolvedValue(ALLOWED);
		const write = vi.fn().mockResolvedValue({ id: 'row' });

		await writeCommands(compilingDatabase(), actor, commands, write);

		expect(resolveCommandOwnership).toHaveBeenCalledTimes(2);
		for (const [index, command] of commands.entries()) {
			expect(resolveCommandOwnership).toHaveBeenNthCalledWith(
				index + 1,
				expect.anything(),
				command,
				actor,
			);
		}
	});

	it('refuses before the write runs when the row is not the actor’s', async () => {
		resolveCommandOwnership.mockResolvedValue({
			kind: 'refused',
			reason: 'This record is not yours.',
		} satisfies OwnershipOutcome);
		const write = vi.fn();

		await expect(writeCommands(compilingDatabase(), actor, commands, write)).rejects.toThrow(
			CommandError,
		);
		// The order is what matters: refusing after the insert would have
		// committed it.
		expect(write).not.toHaveBeenCalled();
	});

	it('answers 403 for a row that is not theirs and 404 for one that is not there', async () => {
		resolveCommandOwnership.mockResolvedValue({
			kind: 'refused',
			reason: 'This record is not yours.',
		} satisfies OwnershipOutcome);
		const refused = await writeCommands(compilingDatabase(), actor, commands, vi.fn()).catch(
			(error: unknown) => error as CommandError,
		);

		resolveCommandOwnership.mockResolvedValue({
			kind: 'missing',
			entity: 'comment',
		} satisfies OwnershipOutcome);
		const missing = await writeCommands(compilingDatabase(), actor, commands, vi.fn()).catch(
			(error: unknown) => error as CommandError,
		);

		expect(refused.status).toBe(403);
		expect(refused.body).toEqual({ error: 'forbidden', reason: 'This record is not yours.' });
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'comment_not_found' });
	});

	it('stops at the first refusal rather than writing the rest of the batch', async () => {
		resolveCommandOwnership
			.mockResolvedValueOnce(ALLOWED)
			.mockResolvedValueOnce({ kind: 'refused', reason: 'nope' } satisfies OwnershipOutcome);
		const write = vi.fn().mockResolvedValue({ id: 'row' });

		await expect(writeCommands(compilingDatabase(), actor, commands, write)).rejects.toThrow(
			CommandError,
		);

		expect(write).toHaveBeenCalledTimes(1);
	});
});

/**
 * The only thing `writeCommands` asks of its database is a transaction to run
 * in. A refusal has to propagate out of that callback, so this deliberately does
 * not swallow — a transaction that ate the throw would abort the batch without
 * telling anyone.
 */
function compilingDatabase(): CommandDb {
	return {
		transaction: () => ({
			execute: async <T>(run: (trx: never) => Promise<T>): Promise<T> => run({} as never),
		}),
	} as unknown as CommandDb;
}
