/**
 * The three mutation handlers every table shares.
 *
 * What a write *is* — its route, its verb, its body, its intent — is built by
 * `commandRequestFor`, because a transaction bypasses these handlers entirely
 * and needs the same answer. What is left here is the part that only the simple
 * path has: send each request, and decide whether to hold the optimistic rows
 * until Electric streams the write back.
 *
 * ## What this layer is, and is not
 *
 * It is transport. Nothing here decides whether a write is allowed, coherent, or
 * complete. The server decides: it re-runs the domain builder over the untrusted
 * body, resolves the actor from the session cookie, and checks ownership and
 * lifecycle inside the write transaction. A rule enforced here as well would be
 * a second copy that can disagree with the first, and the copy that loses is
 * always this one, because it is the one an attacker does not run.
 *
 * Forms do their own validation so a user is not allowed to submit something
 * obviously wrong. That is a UI affordance, not a boundary, and it belongs in
 * the form.
 */

import type {
	DeleteMutationFnParams,
	InsertMutationFnParams,
	UpdateMutationFnParams,
} from '@tanstack/db';
import { type CommandRequest, commandRequestFor, type PendingWrite } from './command-request.js';
import { writeCommand } from './write-command.js';

/**
 * What a refusal without a reason should say.
 *
 * One string rather than one per table: it is only reached when the server
 * refused without explaining, which is a server fault rather than a fact about
 * the table. Every real refusal carries its own `reason`, and that is what a
 * caller renders.
 */
const fallbackMessage = 'Unable to save changes.';

export interface MutationHandlerConfig {
	/** Base URL of the API. The route itself is derived from the collection. */
	readonly serverUrl: string;
}

/**
 * Whether to hold the optimistic rows until Electric streams the write back.
 *
 * Returning `{ txid }` makes the adapter wait for that transaction on the shape
 * stream, which is what stops an edited row flickering back to its old value
 * before the synced one arrives. Returning nothing completes the mutation as soon
 * as the server answers.
 *
 * The choice is not a property of the table — it is whether anything is watching
 * at the moment of the write. A collection with no subscribers has a paused
 * stream and no live query to request a subset snapshot, so neither source
 * `awaitTxId` reads from will ever update: the wait is not slow, it is permanent,
 * and it ends in a timeout on a write that committed. Subscriber count measures
 * exactly that condition, including the case where some *other* mounted component
 * is what keeps the stream warm.
 *
 * It does not promise the txid will arrive — a live stream whose loaded subset
 * excludes the new row still will not carry it — so a caller should continue to
 * treat a confirmation timeout as lag rather than failure.
 */
function confirmationFor(
	// Structural rather than `Collection<TRow>`: the only thing this needs is the
	// count, and asking for the full type drags the collection's generics through a
	// return position where they defeat the schema overload's inference.
	collection: { readonly subscriberCount: number },
	txid: number[],
): { txid: number[] } | undefined {
	return collection.subscriberCount > 0 ? { txid } : undefined;
}

function send(request: CommandRequest): Promise<number> {
	return writeCommand(request.url, request.method, request.body, fallbackMessage);
}

/**
 * Mutations are mapped rather than looped so a multi-row write sends its
 * requests concurrently, and every txid is returned: the collection holds its
 * optimistic rows until Electric streams back *all* of them.
 *
 * `null` requests are dropped. Only an update can produce one, and only when
 * every field it changed was a column the server owns — an edit that asked for
 * nothing, which must not become a request the server refuses for being empty.
 */
async function sendAll<TRow extends object>(
	mutations: readonly PendingWrite<TRow>[],
	serverUrl: string,
): Promise<number[]> {
	const requests = mutations
		.map((mutation) => commandRequestFor(mutation, serverUrl))
		.filter((request): request is CommandRequest => request !== null);

	return Promise.all(requests.map(send));
}

export function createMutationHandlers<TRow extends object>(config: MutationHandlerConfig) {
	return {
		onInsert: async ({ transaction, collection }: InsertMutationFnParams<TRow>) =>
			confirmationFor(collection, await sendAll(transaction.mutations, config.serverUrl)),

		onUpdate: async ({ transaction, collection }: UpdateMutationFnParams<TRow>) => {
			const txid = await sendAll(transaction.mutations, config.serverUrl);
			// A batch of pure no-ops sends nothing, and so has nothing to wait for.
			return txid.length === 0 ? undefined : confirmationFor(collection, txid);
		},

		onDelete: async ({ transaction, collection }: DeleteMutationFnParams<TRow>) =>
			confirmationFor(collection, await sendAll(transaction.mutations, config.serverUrl)),
	};
}
