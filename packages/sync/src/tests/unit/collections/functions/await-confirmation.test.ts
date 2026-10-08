import { describe, expect, it } from 'vitest';
import {
	awaitConfirmation,
	TXID_CONFIRMATION_TIMEOUT_MS,
} from '../../../../collections/functions/await-confirmation.js';

/** A collection whose waits are recorded, as `[txid, timeout]` pairs. */
function watched(subscriberCount = 1, outcome: Promise<unknown> = Promise.resolve(true)) {
	const waits: [number, number | undefined][] = [];
	return {
		waits,
		collection: {
			subscriberCount,
			utils: {
				awaitTxId: (txId: number, timeout?: number) => {
					waits.push([txId, timeout]);
					return outcome;
				},
			},
		},
	};
}

describe('awaitConfirmation', () => {
	it('waits for every txid, each under the pinned timeout', async () => {
		const { waits, collection } = watched();

		await awaitConfirmation(collection, [11, 12]);

		expect(waits).toEqual([
			[11, TXID_CONFIRMATION_TIMEOUT_MS],
			[12, TXID_CONFIRMATION_TIMEOUT_MS],
		]);
	});

	it('pins the five seconds the adapter waited before 0.5', () => {
		expect(TXID_CONFIRMATION_TIMEOUT_MS).toBe(5000);
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
