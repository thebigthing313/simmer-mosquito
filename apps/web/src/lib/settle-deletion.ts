import { type PersistableTransaction, settleWrite } from '@simmer-mosquito/sync';

/**
 * What a delete hands back while the write seam is being migrated: the promise a
 * `hooks/mutations` hook already settled, or the raw transaction a caller still
 * on a collection's own `delete(id)` returns.
 */
export type DeletionResult = Promise<unknown> | PersistableTransaction;

/**
 * Await a deletion, whichever half of the migration it came from.
 *
 * A transaction is recognised by the one thing it has that a promise does not,
 * `when`, and goes through `settleWrite`, so a txid confirmation timeout counts as
 * success. A plain promise is awaited as it is. Once every caller deletes through
 * `hooks/mutations` this collapses back to awaiting the promise.
 */
export function settleDeletion(result: DeletionResult): Promise<unknown> {
	return 'when' in result ? settleWrite(result) : result;
}
