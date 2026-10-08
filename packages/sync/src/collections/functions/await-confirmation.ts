/**
 * Waiting for a committed write to stream back on a collection's shape.
 *
 * Every write path waits the same way: the collection handlers, a multi-row
 * transaction, and the two REST writes in `apps/web`. Each used to read
 * `awaitTxId` off the collection's untyped `utils` itself, and the copies
 * differed on whether a missing one threw.
 */

/**
 * What the wait reads off a collection. Structural, because `utils` is the
 * library's untyped record wherever a handler or a transaction sees it.
 */
export interface ConfirmableCollection {
	readonly subscriberCount: number;
	readonly utils: Record<string, unknown>;
}

/**
 * Wait for every txid on the collection's shape, or resolve at once when
 * nothing would ever arrive.
 *
 * A collection with no subscribers has a paused stream and no live query to
 * snapshot, so its wait does not resolve late: it never resolves, and ends in a
 * timeout on a write that committed. A collection with no `awaitTxId` is not
 * Electric-backed and has no stream to wait on. Both resolve at once.
 *
 * Each wait runs under the adapter's own timeout, fifteen seconds on
 * `electric-db-collection` 0.5. A timeout rejects, and the caller decides
 * whether that is lag.
 */
export async function awaitConfirmation(
	collection: ConfirmableCollection,
	txids: readonly number[],
): Promise<void> {
	if (collection.subscriberCount === 0) {
		return;
	}
	const wait = collection.utils.awaitTxId as ((txId: number) => Promise<unknown>) | undefined;
	if (wait === undefined) {
		return;
	}
	await Promise.all(txids.map((txid) => wait(txid)));
}
