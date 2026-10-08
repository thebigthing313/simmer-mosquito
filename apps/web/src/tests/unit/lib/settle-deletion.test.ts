import { describe, expect, it } from 'vitest';
import { settleDeletion } from '../../../lib/settle-deletion';

function txIdTimeout(): Error {
	const error = new Error('Timeout waiting for txId');
	error.name = 'TimeoutWaitingForTxIdError';
	return error;
}

describe('settleDeletion', () => {
	it('awaits a plain promise as it is, without forgiving a txid timeout', async () => {
		// A hook on `hooks/mutations` hands back a promise it has already settled,
		// so a rejection reaching here is a real one whatever its name.
		const timeout = txIdTimeout();

		await expect(settleDeletion(Promise.resolve('removed'))).resolves.toBe('removed');
		await expect(settleDeletion(Promise.reject(timeout))).rejects.toBe(timeout);
	});

	it('settles a transaction through settleWrite', async () => {
		const asked: string[] = [];
		const transaction = {
			when: (state: 'settled') => {
				asked.push(state);
				return Promise.reject(txIdTimeout());
			},
		};

		await expect(settleDeletion(transaction)).resolves.toBeUndefined();
		expect(asked).toEqual(['settled']);
	});

	it("rejects with the transaction's error when the delete failed", async () => {
		const refusal = new Error('Delete refused');

		await expect(settleDeletion({ when: () => Promise.reject(refusal) })).rejects.toBe(refusal);
	});
});
