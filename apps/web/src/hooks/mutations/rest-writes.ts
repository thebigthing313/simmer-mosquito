/**
 * Writing a table that is not written by command.
 *
 * Three of the fifty-four are: `organizations`, `profiles` and `memberships`.
 * Their writes are identity writes — creating a Profile, ending a Membership,
 * editing the agency's own record — and identity is not part of the command
 * vocabulary *yet*.
 *
 * **This module is transitional.** ADR 0013 folds identity in, so every agency
 * write reaches Postgres the same way: the client states what it intended and
 * the server decides whether to do it. `/commands/profiles` and
 * `/commands/organizations` will exist, these collections go back to
 * `mutations: true`, and this file is deleted with the last surface that needs
 * it. Do not build anything new on it.
 *
 * Until then they travel to their own REST routes, and still need everything a
 * command write gets for free — which is what this is:
 *
 * **The optimistic row still has to move.** The only way to write a collection
 * whose handlers point somewhere else — or has none at all — is to open a
 * transaction. Inside `transaction.mutate()` the library applies the change and
 * calls this `mutationFn` instead of the collection's handlers, which is the
 * same path `sendCommandTransaction` takes for multi-row commands.
 *
 * **The write has to be waited for.** The Electric adapter only reads a `txid`
 * off a *collection handler's* return value, and a transaction never calls
 * those. Nothing waits unless this waits, and the optimistic row is dropped in
 * favour of a synced one that may not have arrived.
 *
 * **And not waited for when nothing is listening.** A collection with no
 * subscribers has a paused stream and no live query to snapshot, so the wait
 * does not resolve late — it never resolves, and ends in a timeout on a write
 * that committed.
 *
 * Each of the three collections declares `mutations: false`, so a direct
 * `collection.update(...)` outside one of these is refused by the library rather
 * than sent to an endpoint that does not exist. This is the only door — until
 * the command endpoints exist, and then the ordinary one is.
 */

import { CommandError, settleWrite } from '@simmer-mosquito/sync';
import { createTransaction } from '@tanstack/db';

/** What a refused body may carry. Every field optional: the shape is the route's to choose. */
export interface RestRefusalBody {
	readonly error?: string;
	readonly reason?: string;
	readonly message?: string;
	readonly txid?: unknown;
	readonly updatedAt?: unknown;
}

/**
 * The error a response means, or `null` when it wrote.
 *
 * A 2xx without a `txid` is a failure: every one of these routes answers with
 * one whenever it wrote, so its absence means no write happened whatever the
 * status line said. Treating it as success leaves the optimistic row on screen
 * forever.
 */
export function restRefusalFor(
	status: number,
	ok: boolean,
	body: RestRefusalBody,
	fallback: string,
): Error | null {
	if (!ok || typeof body.txid !== 'number') {
		return new CommandError(body.reason ?? body.message ?? fallback, status, body);
	}

	return null;
}

/**
 * The least a collection has to be for this to write it — structural, as
 * everywhere else in this codebase that touches a collection.
 *
 * `utils` is left as the library spells it. Its declared type is an index
 * signature rather than a named set of members, so a stricter shape here is not
 * assignable *from* a real collection even though the member exists on one and
 * the direct call compiles. Reading it back out below is where the shape is
 * asserted, once, rather than at every call site.
 */
interface WritableTarget {
	readonly subscriberCount: number;
	readonly utils: Record<string, unknown>;
}

/** The Electric adapter's txid wait, off a collection whose `utils` is untyped. */
function awaitTxIdOn(collection: WritableTarget, txid: number): Promise<unknown> {
	const wait = collection.utils.awaitTxId as ((txId: number) => Promise<unknown>) | undefined;
	return wait === undefined ? Promise.resolve() : wait(txid);
}

export interface RestWriteInput {
	readonly collection: WritableTarget;
	readonly url: string;
	readonly method: 'POST' | 'PATCH' | 'DELETE';
	/** Absent on a delete, which says everything it means in the path. */
	readonly body?: Record<string, unknown>;
	/**
	 * The optimistic rows, written as they should appear.
	 *
	 * Must be synchronous: the ambient transaction is only active for the
	 * synchronous part of the callback, so anything after an `await` would quietly
	 * become a separate write to a collection that refuses them.
	 */
	readonly apply: () => void;
	/** What a refusal that explains nothing should say. */
	readonly fallback: string;
	/**
	 * How to read a refusal, when a route has one worth naming. Defaults to
	 * {@link restRefusalFor}; `organization-writes.ts` supplies its own so a
	 * conflict can say what to do about it rather than printing an error code.
	 */
	readonly refusalFor?: (status: number, ok: boolean, body: RestRefusalBody) => Error | null;
}

/**
 * Apply the change on screen, send it, and wait for it to stream back.
 *
 * Returns `null` when the change was already the stored value — a form opened
 * and closed on Save asks for exactly that, and it must be a silent no-op. The
 * library diffs the row and records no mutation, so the transaction has nothing
 * to commit and this never calls the server. Reading that as a failure is what
 * put "Unable to save changes." in front of an admin who had changed nothing.
 *
 * It is the same suppression `commandRequestFor` gives the command path by
 * returning `null` on an empty patch, arrived at differently: this path states
 * its own body rather than deriving one from the diff, so the diff is the only
 * thing left that knows whether anything moved.
 */
export async function writeThroughRest(input: RestWriteInput): Promise<RestRefusalBody | null> {
	// A box rather than a `let`, because the assignment happens inside a closure
	// the compiler cannot see run, and reading a `let` back afterwards narrows to
	// the initializer.
	const committed: { value: RestRefusalBody | null } = { value: null };
	const refusalFor =
		input.refusalFor ??
		((status: number, ok: boolean, body: RestRefusalBody) =>
			restRefusalFor(status, ok, body, input.fallback));

	const transaction = createTransaction({
		mutationFn: async () => {
			const parsed = await sendRestWrite(input, refusalFor);
			committed.value = parsed;

			// Nothing is watching means the stream is paused and no live query can
			// snapshot it, so the wait does not resolve late — it never resolves.
			if (input.collection.subscriberCount > 0) {
				await awaitTxIdOn(input.collection, parsed.txid as number);
			}
		},
	});

	transaction.mutate(input.apply);

	// Nothing moved, so there is nothing to send and nothing to wait for.
	if (transaction.mutations.length === 0) {
		return null;
	}

	// The server has committed by the time a txid wait times out, so a timeout is
	// lag rather than failure. Every other rejection is real and propagates.
	await settleWrite(transaction);

	// Reached only if the transaction resolved without the mutation function
	// running, which would mean the row moved on screen and nowhere else.
	if (committed.value === null) {
		throw new Error(input.fallback);
	}

	return committed.value;
}

async function sendRestWrite(
	input: RestWriteInput,
	refusalFor: (status: number, ok: boolean, body: RestRefusalBody) => Error | null,
): Promise<RestRefusalBody> {
	const response = await fetch(input.url, {
		method: input.method,
		credentials: 'include',
		headers: {
			accept: 'application/json',
			...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
	});

	const parsed = (await readRestBody(response)) as RestRefusalBody;
	const refusal = refusalFor(response.status, response.ok, parsed);
	if (refusal !== null) {
		throw refusal;
	}

	return parsed;
}

/** As in `write-command.ts`: a proxy can answer with HTML, so parse only what parses. */
async function readRestBody(response: Response): Promise<Record<string, unknown>> {
	const text = await response.text();
	if (text.trim() === '') {
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return { message: text.slice(0, 200) };
	}
}
