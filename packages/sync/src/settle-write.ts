/**
 * Settling an optimistic write.
 *
 * A TanStack DB transaction settles `when('settled')` only after the write's txid
 * is observed back on the Electric shape stream. The server POST has already
 * committed by then, so a confirmation timeout means "committed, sync lagging", not
 * a failure. On-demand collections hit this whenever their live stream is cold, and
 * treating it as an error strands the user on a form they just saved.
 */

/**
 * The optimistic-transaction shape returned by collection insert/update/delete.
 *
 * `when('settled')` resolves once the write is confirmed and rejects with the
 * write's error when it fails. It replaced `isPersisted.promise`, which
 * `@tanstack/db` 0.12 deprecates and the 1.0 RC removes.
 */
export interface PersistableTransaction {
	when(state: 'settled'): Promise<unknown>;
}

/**
 * True when an optimistic write rejected only because its txid was not observed on
 * the Electric shape stream in time (`TimeoutWaitingForTxIdError` from
 * `@tanstack/electric-db-collection`).
 */
export function isTxIdConfirmationTimeout(error: unknown): boolean {
	return error instanceof Error && error.name === 'TimeoutWaitingForTxIdError';
}

/**
 * Await an optimistic write, treating a txid-confirmation timeout as success. Any
 * other rejection propagates so real failures still surface.
 *
 * Use this instead of `await transaction.when('settled')` anywhere the UI moves on
 * after a save: navigating to the new record, closing a dialog, clearing a form.
 */
export async function settleWrite(transaction: PersistableTransaction): Promise<void> {
	try {
		await transaction.when('settled');
	} catch (error) {
		if (!isTxIdConfirmationTimeout(error)) {
			throw error;
		}
	}
}
