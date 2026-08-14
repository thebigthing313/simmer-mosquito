/**
 * The three mutation handlers every table shares.
 *
 * Each command endpoint has the same three routes — `POST {base}`,
 * `PATCH {base}/{id}`, `DELETE {base}/{id}` — so the handlers differ only in
 * where they point and what they put in the body. Both are arguments here.
 *
 * What is deliberately *not* an argument is a list of patchable keys. TanStack DB
 * already computes the diff and hands it over as `mutation.changes`; deriving it
 * a second time from a hand-maintained key list is what lets a write to a key
 * outside that list settle successfully with nothing sent.
 */

import type {
	DeleteMutationFnParams,
	InsertMutationFnParams,
	UpdateMutationFnParams,
} from '@tanstack/db';
import { locationSourceFields, readIntent } from './mutation-metadata.js';
import { writeCommand } from './write-command.js';

/**
 * The body a write sends, with the command it means named on it when the caller
 * said so.
 *
 * `intent` goes last so a table's own projection can never shadow it, and is
 * omitted entirely when absent — an endpoint that has not learned to read it
 * receives exactly the payload it receives today.
 */
function withIntent(body: CommandBody, metadata: unknown): CommandBody {
	const intent = readIntent(metadata);
	return intent === undefined ? body : { ...body, intent };
}

/**
 * Whether to hold the optimistic rows until Electric streams the write back.
 *
 * Returning `{ txid }` makes the adapter wait for that transaction on the shape
 * stream, which is what stops an edited row flickering back to its old value
 * before the synced one arrives. Returning nothing completes the mutation as
 * soon as the server answers.
 *
 * The choice is not a property of the table — it is whether anything is watching
 * at the moment of the write. A collection with no subscribers has a paused
 * stream and no live query to request a subset snapshot, so neither source
 * `awaitTxId` reads from will ever update: the wait is not slow, it is
 * permanent, and it ends in a timeout on a write that committed. Subscriber
 * count measures exactly that condition, including the case where some *other*
 * mounted component is what keeps the stream warm.
 *
 * It does not promise the txid will arrive — a live stream whose loaded subset
 * excludes the new row still will not carry it — so a caller should continue to
 * treat a confirmation timeout as lag rather than failure.
 */
function confirmationFor(
	// Structural rather than `Collection<TRow>`: the only thing this needs is the
	// count, and asking for the full type drags the collection's generics through
	// a return position where they defeat the schema overload's inference.
	collection: { readonly subscriberCount: number },
	txid: number[],
): { txid: number[] } | undefined {
	return collection.subscriberCount > 0 ? { txid } : undefined;
}

/**
 * The body of a command, in the vocabulary the endpoints speak.
 *
 * Rows are named for their Postgres columns; command payloads are the domain's
 * own camelCase names. The projection between them belongs to the table, so both
 * builders below are supplied by the collection rather than inferred here.
 */
export type CommandBody = Record<string, unknown>;

export interface MutationHandlerConfig<TRow extends object> {
	/** Absolute URL of the table's command endpoint, without a trailing slash. */
	readonly endpoint: string;
	/** What a refusal without a reason should say. */
	readonly fallbackMessage: string;
	/** The create payload for one row, plus whatever rode in on `insert()`'s metadata. */
	readonly toInsertBody: (row: TRow, metadata: unknown) => CommandBody;
	/**
	 * The patch payload for one edit. Receives the library's own diff — only the
	 * fields that actually changed — plus the mutation metadata, for inputs the
	 * row cannot carry (geometry, acknowledgements).
	 */
	readonly toUpdateBody: (changes: Partial<TRow>, metadata: unknown) => CommandBody;
}

/**
 * Mutations are mapped rather than looped so a multi-row transaction sends its
 * writes concurrently, and every txid is returned: the collection holds its
 * optimistic rows until Electric streams back *all* of them.
 */
export function createMutationHandlers<TRow extends object>(config: MutationHandlerConfig<TRow>) {
	return {
		onInsert: async ({ transaction, collection }: InsertMutationFnParams<TRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map((mutation) =>
					writeCommand(
						config.endpoint,
						'POST',
						withIntent(
							{
								...config.toInsertBody(mutation.modified, mutation.metadata),
								...locationSourceFields(mutation.metadata),
							},
							mutation.metadata,
						),
						config.fallbackMessage,
					),
				),
			);
			return confirmationFor(collection, txid);
		},

		onUpdate: async ({ transaction, collection }: UpdateMutationFnParams<TRow>) => {
			const written = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					// A re-drawn shape is a change even when no column moved, so the
					// location instruction is folded in before the emptiness check. An
					// intent is not: naming the command a caller meant does not give an
					// endpoint anything to write, so it is appended after.
					const body = {
						...config.toUpdateBody(mutation.changes as Partial<TRow>, mutation.metadata),
						...locationSourceFields(mutation.metadata),
					};
					if (Object.keys(body).length === 0) {
						return null;
					}
					return writeCommand(
						`${config.endpoint}/${String(mutation.key)}`,
						'PATCH',
						withIntent(body, mutation.metadata),
						config.fallbackMessage,
					);
				}),
			);
			// A transaction of pure no-ops sends nothing and so has nothing to wait for.
			const txid = written.filter((value): value is number => value !== null);
			return txid.length === 0 ? undefined : confirmationFor(collection, txid);
		},

		onDelete: async ({ transaction, collection }: DeleteMutationFnParams<TRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map((mutation) => {
					// A delete has no payload of its own, so it stays bodiless unless the
					// caller named a command — the endpoints already read an optional body.
					const intent = withIntent({}, mutation.metadata);
					return writeCommand(
						`${config.endpoint}/${String(mutation.key)}`,
						'DELETE',
						Object.keys(intent).length === 0 ? undefined : intent,
						config.fallbackMessage,
					);
				}),
			);
			return confirmationFor(collection, txid);
		},
	};
}
