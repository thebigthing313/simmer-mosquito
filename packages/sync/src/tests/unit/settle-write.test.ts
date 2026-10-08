import { describe, expect, it } from 'vitest';
import { type PersistableTransaction, settleWrite } from '../../settle-write.js';

/** A transaction whose `when('settled')` does what `outcome` does. */
function settlingWith(outcome: Promise<unknown>): PersistableTransaction & {
	readonly asked: string[];
} {
	const asked: string[] = [];
	return {
		asked,
		when: (state) => {
			asked.push(state);
			return outcome;
		},
	};
}

function txIdTimeout(): Error {
	const error = new Error('Timeout waiting for txId');
	error.name = 'TimeoutWaitingForTxIdError';
	return error;
}

describe('settleWrite', () => {
	it("resolves when the transaction settles, having asked for 'settled'", async () => {
		const transaction = settlingWith(Promise.resolve({}));

		await expect(settleWrite(transaction)).resolves.toBeUndefined();
		expect(transaction.asked).toEqual(['settled']);
	});

	it('resolves when the only failure is a txid confirmation timeout', async () => {
		await expect(settleWrite(settlingWith(Promise.reject(txIdTimeout())))).resolves.toBeUndefined();
	});

	it('rejects with the write’s own error on any other failure', async () => {
		const refusal = new Error('Command refused');

		await expect(settleWrite(settlingWith(Promise.reject(refusal)))).rejects.toBe(refusal);
	});
});
