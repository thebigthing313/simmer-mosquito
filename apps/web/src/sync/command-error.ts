import type { DeleteImpactEntry } from '../hooks/use-delete-impact';

/**
 * A refused command, with the server's answer still attached.
 *
 * Every command endpoint answers a failure with a structured body — `{ error,
 * reason }` for a refusal, `{ error: 'delete_blocked', message, blockers }` for
 * a delete something still references, `{ error: 'invalid_command', issues }`
 * for a validation failure. Until this existed, each of the sixteen mutation
 * modules reduced that body to its message and threw a bare `Error`, so the
 * only thing that survived the write layer was a sentence.
 *
 * That was most visible on a blocked delete. `blockers` exists so a client that
 * raced the impact check can name what stopped it "without a second round-trip"
 * (`apps/server/src/record-deletion.ts`), and nothing read it — the card had to
 * ask the server again to find out what it had just been told.
 *
 * `message` stays the human sentence, so every existing `catch` that shows
 * `error.message` keeps working unchanged. `body` is the part that was being
 * thrown away.
 */
export class CommandError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(message);
		this.name = 'CommandError';
	}
}

/**
 * The `CommandError` for a response that failed, whatever shape it came in.
 *
 * `fallback` is the sentence to show when the body has nothing to say — a
 * gateway error, an empty 500, a proxy's HTML. It should name the record:
 * "Unable to save address."
 */
export function commandErrorFrom(
	response: Response,
	body: unknown,
	fallback: string,
): CommandError {
	return new CommandError(messageFromBody(body, fallback), response.status, body);
}

/** The most specific sentence the body offers, or `fallback`. */
export function messageFromBody(body: unknown, fallback: string): string {
	if (!isRecord(body)) {
		return fallback;
	}
	// `reason` first: it is what the role and lifecycle refusals carry, and it is
	// the more specific of the two whenever both are present.
	if (typeof body.reason === 'string' && body.reason !== '') {
		return body.reason;
	}
	return typeof body.message === 'string' && body.message !== '' ? body.message : fallback;
}

/** The `{ error: 'delete_blocked', blockers }` body, when that is what happened. */
export interface DeleteBlockedBody {
	readonly error: 'delete_blocked';
	readonly message: string;
	readonly blockers: readonly DeleteImpactEntry[];
}

export function isDeleteBlocked(error: unknown): error is CommandError & {
	readonly body: DeleteBlockedBody;
} {
	if (!(error instanceof CommandError) || !isRecord(error.body)) {
		return false;
	}
	return error.body.error === 'delete_blocked' && Array.isArray(error.body.blockers);
}

/**
 * What stopped a delete, straight from the 409 that refused it.
 *
 * Empty for any other failure, so a caller can render this without first
 * asking which kind of error it has.
 */
export function readBlockers(error: unknown): readonly DeleteImpactEntry[] {
	return isDeleteBlocked(error) ? error.body.blockers : [];
}

/**
 * Reads a response body without assuming it is JSON.
 *
 * A failed request does not always come from the application: a proxy or a
 * gateway can answer with HTML or with nothing at all, an unhandled server
 * error answers the bare text `Internal Server Error`, and `response.json()`
 * throws on all of them. Returning an empty object there lets the caller fall
 * back to its own sentence instead of showing the operator a parse error where
 * the real fault should have been.
 *
 * Anything that is not a JSON object is `{}` too. Callers test the parsed body
 * with `'txid' in result`, and `in` throws on a string or a number — so a body
 * of `"nope"` would fail in the same shape this exists to prevent.
 */
export async function readResponseBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text.trim().length === 0) {
		return {};
	}
	try {
		const parsed = JSON.parse(text) as unknown;
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
