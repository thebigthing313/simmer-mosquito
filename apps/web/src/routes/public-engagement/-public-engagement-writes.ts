// Shared write plumbing for the public-engagement routes. Dash-prefixed so
// TanStack Router ignores this file as a route.

/** The optimistic-transaction shape returned by collection insert/update/delete. */
interface PersistableTransaction {
	readonly isPersisted: { readonly promise: Promise<unknown> };
}

/**
 * True when an optimistic write rejected only because its txid was not observed on
 * the Electric shape stream in time (`TimeoutWaitingForTxIdError` from
 * `@tanstack/electric-db-collection`). The server POST has already committed by the
 * time the library waits for that confirmation, so this means "submitted, awaiting
 * sync" — not a failure. On-demand collections (contacts, service requests) hit this
 * when their live stream is cold; a page-level warm-up query keeps it rare.
 */
export function isTxIdConfirmationTimeout(error: unknown): boolean {
	return error instanceof Error && error.name === 'TimeoutWaitingForTxIdError';
}

/**
 * Await an optimistic write, treating a txid-confirmation timeout as success (the
 * write committed server-side; only the sync round-trip lagged). Any other rejection
 * propagates so real failures still surface.
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
