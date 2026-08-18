/**
 * Writing the agency's own record.
 *
 * The one table on this seam whose writes do not go through `mutateCollection`,
 * because they do not go to `/commands/organizations` — there is no such
 * endpoint, and there should not be. `organizations` holds one row per agency
 * and its settings are a JSON document, so a write is not "these columns
 * changed": it is one of eight named things a Profile can do to the agency.
 * Seven are `organizationSettings.*` commands, each with its own route, its own
 * floor and its own validation; the eighth is the agency's details, which is an
 * identity write and named in `IdentityWriteSurface` instead.
 *
 * Sending the whole document instead is what this replaces, and it cost three
 * things:
 *
 * The server could not validate. `PATCH /organization/current` passed the
 * incoming document through `resolveOrganizationSettings`, which is deliberately
 * lenient — it substitutes a default and records an issue rather than refusing —
 * and then dropped the issues. A timezone the agency could not use became the
 * default silently. The per-command routes refuse it, and check the referenced
 * rows besides: that a unit code exists and is the right kind of unit, and that
 * a Species Key Binding still names a species that exists.
 *
 * A save rewrote settings nobody touched. Editing the larval density bands sent
 * the timezone, the unit defaults and the key bindings back from the editor's own
 * copy. `mergeOrganizationSettingsChange` on the server now merges one
 * sub-document, so the rest of the settings are not in the request at all.
 *
 * And the conflict check did nothing. The old handler caught the server's 409 and
 * immediately re-sent with `expectedUpdatedAt: null`, which always won. Nothing
 * here retries: a conflict is raised, and the surface shows it.
 *
 * ## Why a transaction rather than a collection write
 *
 * The optimistic row still has to move — an admin who saves a setting should see
 * it — and the only way to write a collection whose handlers point somewhere else
 * is to open a transaction. Inside `transaction.mutate()` the library applies the
 * change to the collection and calls this `mutationFn` instead of the
 * collection's handlers, which is the same path `sendCommandTransaction` takes
 * for multi-row commands, for the same reason and with the same two obligations:
 * wait for the write to stream back, and do not wait when nothing is listening.
 *
 * `lib/collections/organizations.ts` declares `mutations: false`, so a stray
 * `organizations.update(...)` outside a transaction is refused by the library
 * rather than sent to an endpoint that does not exist.
 */

import { CommandError, settleWrite } from '@simmer-mosquito/sync';
import { createTransaction } from '@tanstack/db';
import { organizations } from '../../lib/collections/organizations';

/**
 * What both routes answer with.
 *
 * `updatedAt` is why this does not use `writeCommand` from `packages/sync`, which
 * returns the txid alone. Saving the agency details can mean two writes — the
 * details are a REST write and the timezone beside them is a command — and the
 * second has to state the `updated_at` the first produced, or it conflicts with
 * the write the same click just made.
 */
export interface OrganizationWriteResult {
	readonly txid: number;
	readonly updatedAt: string;
}

/**
 * A refused write that another write caused.
 *
 * Its own class so a surface can say something true about it. Every other refusal
 * is about what the Profile asked for; this one is about when they asked, and the
 * answer is to look at the current values and decide again.
 *
 * The trade-off in raising it at all: `updated_at` belongs to the row, not to the
 * setting, so a colleague who changed the mailing address while this sheet was
 * open is a conflict too, even though the server would have merged the two
 * sub-documents without touching each other. That is the safe direction, and
 * agency-level writes are rare enough that the false conflict is rarer than the
 * real one. Suppressing it would mean sending no `expectedUpdatedAt` at all,
 * which is where this started.
 */
export class OrganizationConflictError extends Error {
	constructor() {
		super('Somebody else changed this agency while you were editing. Reopen to see their changes.');
		this.name = 'OrganizationConflictError';
	}
}

/**
 * The two routes spell the same refusal differently: the details route answers
 * `organization_conflict` and the settings routes answer `settings_conflict`.
 */
const conflictErrors: ReadonlySet<string> = new Set(['settings_conflict', 'organization_conflict']);

/** What a refused body may carry, from either route. */
export interface OrganizationRefusalBody {
	readonly error?: string;
	readonly reason?: string;
	readonly message?: string;
	readonly txid?: unknown;
	readonly updatedAt?: unknown;
}

/**
 * The error a response means, or `null` when it wrote.
 *
 * Pure, and separate from the request for one reason: it is where the retry used
 * to be. The handler this replaces caught the 409 and immediately re-sent the
 * same body with `expectedUpdatedAt: null`, which the server cannot refuse — so
 * the concurrency check cost a round trip and stopped nothing, and the editor who
 * saved second silently overwrote the one who saved first. There is no second
 * attempt here; a conflict is an error the surface shows.
 *
 * A 2xx without a `txid` is a failure too. Both routes answer with one whenever
 * they wrote, so its absence means no write happened, whatever the status said.
 */
export function organizationRefusalFor(
	status: number,
	ok: boolean,
	body: OrganizationRefusalBody,
): Error | null {
	if (status === 409 && conflictErrors.has(body.error ?? '')) {
		return new OrganizationConflictError();
	}

	if (!ok || typeof body.txid !== 'number') {
		return new CommandError(body.reason ?? body.message ?? 'Unable to save changes.', status, body);
	}

	return null;
}

/** Send one write and read back what it committed. */
async function sendOrganizationWrite(
	url: string,
	body: Record<string, unknown>,
): Promise<OrganizationWriteResult> {
	const response = await fetch(url, {
		method: 'PATCH',
		credentials: 'include',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

	const parsed = (await readBody(response)) as OrganizationRefusalBody;
	const refusal = organizationRefusalFor(response.status, response.ok, parsed);
	if (refusal !== null) {
		throw refusal;
	}

	return {
		txid: parsed.txid as number,
		updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
	};
}

/** As in `write-command.ts`: a proxy can answer with HTML, so parse only what parses. */
async function readBody(response: Response): Promise<Record<string, unknown>> {
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

/**
 * Apply the change on screen, send it, and wait for it to stream back.
 *
 * Returns `null` when the change was already the stored value. A settings sheet
 * that is opened and closed on Save asks for exactly that, and it must be a
 * silent no-op: the library diffs the row and records no mutation, so the
 * transaction has nothing to commit and this never calls the server. Reading
 * that as a failure is what the first cut did, and it put "Unable to save
 * changes." in front of an admin who changed nothing.
 *
 * The same suppression the rest of the seam gets from `commandRequestFor`
 * returning `null` on an empty patch — arrived at differently, because this path
 * states its own body rather than deriving one from the diff.
 *
 * `apply` must be synchronous. The ambient transaction is only active for the
 * synchronous part of the callback, so anything after an `await` would quietly
 * become a separate write to a collection that refuses them.
 */
export async function writeOrganization(input: {
	readonly url: string;
	readonly body: Record<string, unknown>;
	readonly apply: () => void;
}): Promise<OrganizationWriteResult | null> {
	// A box rather than a `let`, because the assignment happens inside a closure
	// the compiler cannot see run, and reading a `let` back afterwards narrows to
	// the initializer.
	const committed: { value: OrganizationWriteResult | null } = { value: null };

	const transaction = createTransaction({
		mutationFn: async () => {
			const result = await sendOrganizationWrite(input.url, input.body);
			committed.value = result;

			// Nothing is watching means the stream is paused and no live query can
			// snapshot it, so the wait does not resolve late — it never resolves.
			if (organizations.subscriberCount > 0) {
				await organizations.utils.awaitTxId(result.txid);
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
		throw new Error('Unable to save changes.');
	}

	return committed.value;
}
