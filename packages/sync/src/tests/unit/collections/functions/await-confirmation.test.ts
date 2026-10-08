import { describe, expect, it } from 'vitest';
import { awaitConfirmation } from '../../../../collections/functions/await-confirmation.js';

/** A collection whose waits are recorded, each as the arguments it was called with. */
function watched(subscriberCount = 1, outcome: Promise<unknown> = Promise.resolve(true)) {
	const waits: unknown[][] = [];
	return {
		waits,
		collection: {
			subscriberCount,
			utils: {
				awaitTxId: (...args: unknown[]) => {
					waits.push(args);
					return outcome;
				},
			},
		},
	};
}

describe('awaitConfirmation', () => {
	it("waits for every txid under the adapter's own timeout", async () => {
		// No second argument: a timeout passed here would pin the wait against
		// whatever default `electric-db-collection` ships.
		const { waits, collection } = watched();

		await awaitConfirmation(collection, [11, 12]);

		expect(waits).toEqual([[11], [12]]);
	});

	it('does not wait on a collection nothing is watching', async () => {
		// A paused stream never carries the txid, so a wait there ends only in a
		// timeout on a write that committed.
		const { waits, collection } = watched(0);

		await awaitConfirmation(collection, [11]);

		expect(waits).toEqual([]);
	});

	it('resolves on a collection with no txid wait to call', async () => {
		await expect(
			awaitConfirmation({ subscriberCount: 1, utils: {} }, [11]),
		).resolves.toBeUndefined();
	});

	it('passes a timeout through for the caller to judge', async () => {
		const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutWaitingForTxIdError' });
		const { collection } = watched(1, Promise.reject(timeout));

		await expect(awaitConfirmation(collection, [11])).rejects.toBe(timeout);
	});
});
