/**
 * A command that one row cannot describe, as one request and many optimistic rows.
 *
 * `mutateCollection` covers the ordinary write: one row, one key, one body the
 * library diffs for you. It is bound to `SingleRowCommandType`, so the fifteen
 * commands in `MultiRowCommandType` are a compile error there and arrive here
 * instead — a create carrying its children, a move restacking an id list, a merge
 * retiring one, a record closing the stop that produced it.
 *
 * ## One request, always
 *
 * Every one of those is a single command with a single payload. So this sends one
 * request, and the mutations exist only so the library can apply the change
 * optimistically and take it back if the server refuses. That is why the body is
 * the caller's to state rather than something derived from the rows: there is no
 * general rule that turns a parent row and N child rows into the shape a
 * particular command wants, and inventing one would be a second place the command
 * is described.
 *
 * The alternative — one request per mutation, reusing `commandRequestFor` — is
 * worse than the two-phase writes this replaces. A create would POST the parent,
 * then POST each child as its own command; if a child were refused, the library
 * would roll the whole group off the screen while the server kept the parent.
 * The user would be looking at a record that exists and is not there.
 *
 * ## What this owns and what the caller owns
 *
 * The caller owns the body, because only it knows the command. This owns the
 * three things that are the same for every multi-row command and are each easy
 * to get wrong once and never notice:
 *
 * 1. **The read-only refusal.** TanStack DB's own check is
 *    `!ambientTransaction && !config.onInsert`, so a collection created with
 *    `mutations: false` throws on a direct write and silently accepts the same
 *    write inside a transaction. This is the one path where that guard has to be
 *    run by hand.
 * 2. **Waiting for the write to stream back.** The Electric adapter only reads a
 *    `txid` off a *collection handler's* return value, and a transaction never
 *    calls those handlers. Nothing waits unless this waits, and when the
 *    transaction completes the optimistic rows are dropped in favour of synced
 *    ones that may not have arrived — which is the flicker the whole exercise is
 *    meant to avoid.
 * 3. **Not waiting when nothing is listening.** A collection with no subscribers
 *    has a paused stream and no live query to snapshot, so its wait does not
 *    resolve late — it never resolves, and ends in a timeout on a write that
 *    committed. `subscriberCount` measures exactly that, per collection, which
 *    matters here because a transaction routinely spans a warm collection and a
 *    cold one.
 */

import { createTransaction } from '@tanstack/db';
import { type CommandBody, refuseIfReadOnly, type WriteTarget } from './command-request.js';
import type { MutationTransaction } from './mutate-collection.js';
import { commandPathFor } from './routes.js';
import { writeCommand } from './write-command.js';

/**
 * Re-exported here rather than from the package root directly, because this is
 * the only path that needs it: `commandRequestFor` builds a single-row body for
 * itself, and a caller reaching for this one is composing a transaction's.
 */
export { commandBodyFromRow } from './command-request.js';

/** What a refusal without a reason should say — as in `mutation-handlers.ts`. */
const fallbackMessage = 'Unable to save changes.';

/**
 * The mutation fields a transaction reads.
 *
 * Structural, like every other library type this package touches, and narrower
 * than `PendingWrite`: the rows are never read here, only the collections they
 * belong to.
 */
export interface TransactionWrite extends WriteTarget {
	readonly collection: WriteTarget['collection'] & {
		/** Zero means nothing is watching this collection — see the module comment. */
		readonly subscriberCount: number;
		readonly utils: {
			readonly awaitTxId: (txId: number) => Promise<unknown>;
		};
	};
}

/** The one request a multi-row command becomes. */
export interface CommandTransactionRequest {
	/**
	 * The Postgres table whose endpoint this command is posted to — the parent's,
	 * for a create that carries children.
	 */
	readonly table: string;
	readonly method: 'POST' | 'PATCH' | 'DELETE';
	/**
	 * The row in the path, on the verbs that have one. A create has none: its id
	 * travels in the body, which is the same value, because SIMMER writes carry
	 * their own ids.
	 */
	readonly key?: string;
	/**
	 * The command's payload, keyed by Postgres column name. Stated rather than
	 * derived — see the module comment. The intent is added here, so it must not
	 * be in this.
	 */
	readonly body: CommandBody;
}

export interface CommandTransactionInput<TIntent extends string> {
	/**
	 * The command this write means. One name, not a list: a multi-row command is
	 * one command, and that is the whole reason it is one request.
	 */
	readonly intent: TIntent;
	readonly request: CommandTransactionRequest;
	/**
	 * The optimistic rows, written to their collections as they should appear.
	 *
	 * Runs inside the transaction, so ordinary `collection.insert(row)` calls join
	 * it rather than firing their own writes. It must be synchronous: the ambient
	 * transaction is only active for the synchronous part of the callback, and
	 * anything after an `await` would quietly become a separate write.
	 */
	readonly apply: () => void;
}

export interface CommandTransactionConfig {
	/** Base URL of the API. The route itself is derived from the table. */
	readonly serverUrl: string;
}

function urlFor(serverUrl: string, request: CommandTransactionRequest): string {
	const endpoint = `${serverUrl}${commandPathFor(request.table)}`;
	return request.key === undefined ? endpoint : `${endpoint}/${request.key}`;
}

/**
 * The collections a transaction touched, once each.
 *
 * A create with four batches holds five mutations across two collections, and
 * both the read-only check and the txid wait are per collection rather than per
 * row.
 */
function collectionsOf(
	mutations: readonly TransactionWrite[],
): readonly TransactionWrite['collection'][] {
	const seen = new Map<string, TransactionWrite['collection']>();

	for (const mutation of mutations) {
		if (!seen.has(mutation.collection.id)) {
			seen.set(mutation.collection.id, mutation.collection);
		}
	}

	return [...seen.values()];
}

/**
 * Send the command, and hold the optimistic rows until it streams back.
 *
 * Separate from the transaction that calls it so it can be tested without live
 * Electric-backed collections, which is the same reason `commandRequestFor`
 * takes a structural mutation rather than the library's own.
 */
export async function sendCommandTransaction(input: {
	readonly mutations: readonly TransactionWrite[];
	readonly request: CommandTransactionRequest;
	readonly intent: string;
	readonly serverUrl: string;
}): Promise<void> {
	// Before the request rather than after: a collection this app declared
	// unwritable should not have its write sent, only to be rolled back.
	for (const mutation of input.mutations) {
		refuseIfReadOnly(mutation);
	}

	const txid = await writeCommand(
		urlFor(input.serverUrl, input.request),
		input.request.method,
		{ ...input.request.body, intents: [input.intent] },
		fallbackMessage,
	);

	// One txid for the whole command — the server committed it in one Postgres
	// transaction — awaited on every collection that has someone watching.
	// Concurrently, because they are separate streams.
	await Promise.all(
		collectionsOf(input.mutations)
			.filter((collection) => collection.subscriberCount > 0)
			.map((collection) => collection.utils.awaitTxId(txid)),
	);
}

/**
 * Bind the vocabulary once, as `createCollectionMutator` does.
 *
 * Same reason: `packages/sync` has no dependency on `packages/domain` and must
 * not acquire one, so the command names arrive as a type argument from the app,
 * which depends on both. Binding it to `MultiRowCommandType` is what keeps an
 * ordinary single-row write from being sent this way — it would be one request
 * either way, but it would skip the diffing and the no-op suppression that
 * `commandRequestFor` does for free.
 */
export function createCommandTransactor<TIntent extends string>(config: CommandTransactionConfig) {
	return function commandTransaction(input: CommandTransactionInput<TIntent>): MutationTransaction {
		const transaction = createTransaction({
			mutationFn: ({ transaction: pending }) =>
				sendCommandTransaction({
					mutations: pending.mutations,
					request: input.request,
					intent: input.intent,
					serverUrl: config.serverUrl,
				}),
		});

		transaction.mutate(input.apply);

		return transaction;
	};
}
