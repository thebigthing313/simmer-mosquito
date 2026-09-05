/**
 * The HTTP half of a collection write.
 *
 * Every organization command endpoint answers the same way — a JSON body
 * carrying a `txid` on success, a `reason`/`message` on refusal — so the
 * request, the refusal, and the txid read are the same three lines for every
 * table. What differs per table is the URL and the body, and both are
 * arguments.
 *
 * Authorization and the authoritative validation both live on the server: it
 * resolves the actor from the session cookie, re-runs the domain builder over
 * the untrusted body, and checks ownership inside the write transaction. Nothing
 * here gates anything, so there is nothing here to keep in step with the domain.
 */

import { sessionFetch } from './session-fetch.js';

/**
 * What a refusal body may carry. Every field optional because the shape is the
 * server's to choose, and a caller reading one has to cope with any of them.
 */
export interface CommandRefusal {
	readonly error?: string;
	readonly reason?: string;
	readonly message?: string;
	readonly blockers?: readonly unknown[];
}

/**
 * A refused command, carrying enough for a caller to render or re-ask.
 *
 * This is the only `CommandError` in the workspace: `apps/web` re-exports it
 * rather than declaring its own, because a second class with the same shape
 * made every `instanceof` test against it false for a real refusal (#323).
 *
 * The constructor takes the body as `unknown` because not every caller reads a
 * command endpoint. A proxy answers with HTML, a gateway with nothing, and a
 * raw `Response` handed here can carry either. Anything that is not an object
 * becomes `{}`, so `body` is always something a caller can read a field off.
 */
export class CommandError extends Error {
	readonly status: number;
	readonly body: CommandRefusal;

	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = 'CommandError';
		this.status = status;
		this.body = isRefusalBody(body) ? body : {};
	}
}

function isRefusalBody(body: unknown): body is CommandRefusal {
	return typeof body === 'object' && body !== null;
}

/**
 * Send one command and return the transaction id it committed under.
 *
 * A 2xx without a `txid` is a failure, not a success: the endpoints answer with
 * one whenever they wrote, so its absence means no write happened.
 */
export async function writeCommand(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: Record<string, unknown> | undefined,
	fallbackMessage: string,
): Promise<number> {
	// `sessionFetch` rather than `fetch`: a write meeting an access token that aged
	// out is refused now that the command routes verify rather than renew (#298),
	// and a refused write is the one a user watches fail. It renews once and sends
	// the command again.
	const response = await sessionFetch(url, {
		method,
		credentials: 'include',
		headers: {
			accept: 'application/json',
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});

	// A command endpoint answers with a `txid` when it wrote and a reason when it
	// refused; both arrive in the same JSON object, so it is read as one.
	const parsed: CommandRefusal & { readonly txid?: unknown } = await readBody(response);

	if (!response.ok || typeof parsed.txid !== 'number') {
		throw new CommandError(
			parsed.reason ?? parsed.message ?? fallbackMessage,
			response.status,
			parsed,
		);
	}

	return parsed.txid;
}

/**
 * A gateway or proxy can answer a command with HTML, so the body is read as text
 * first and only then parsed — otherwise the JSON error replaces the HTTP one and
 * the caller is told the wrong thing went wrong.
 */
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
