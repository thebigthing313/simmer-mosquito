/**
 * Settling an optimistic write.
 *
 * A TanStack DB transaction resolves `isPersisted` only after the write's txid is
 * observed back on the Electric shape stream. The server POST has already committed
 * by then, so a confirmation timeout means "committed, sync lagging" — not a
 * failure. On-demand collections hit this whenever their live stream is cold, and
 * treating it as an error strands the user on a form they just saved.
 */

/** The optimistic-transaction shape returned by collection insert/update/delete. */
export interface PersistableTransaction {
	readonly isPersisted: { readonly promise: Promise<unknown> };
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
 * Use this instead of `await transaction.isPersisted.promise` anywhere the UI moves
 * on after a save — navigating to the new record, closing a dialog, clearing a form.
 */
export async function settleWrite(transaction: PersistableTransaction): Promise<void> {
	try {
		await transaction.isPersisted.promise;
	} catch (error) {
		if (!isTxIdConfirmationTimeout(error)) {
			throw error;
		}
	}
}
