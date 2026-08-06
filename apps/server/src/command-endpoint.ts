/**
 * The plumbing every agency command endpoint shares once authorization is done.
 *
 * A command endpoint is the same shape in all eight domains: read the body,
 * build a domain command, run it in a transaction, and turn any refusal into a
 * typed 4xx. The refusal half lives here.
 *
 * `CommandError` in particular has to be a single class. Every domain's
 * `handleCommandError` catches it with `instanceof`, which compares class
 * identity rather than shape, so seven per-domain declarations meant a typed
 * 4xx raised in one module and caught in another would have escaped as an
 * unhandled 500. No such path existed when these were merged — the domains
 * only ever called their own helpers — but the shape invited one, and
 * `control-operations-commands/shared.ts` already reads rows belonging to other
 * domains while raising it.
 */

import { RecordDeleteBlockedError } from '@simmer-mosquito/db';
import type { Context } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { deleteBlockedBody } from './record-deletion.js';

/** A request that has been through `authContextMiddleware`. */
export type CommandContext = Context<{ Variables: AuthVariables }>;

/**
 * A refusal raised from inside a command handler, carrying the response it
 * should become.
 *
 * Thrown rather than returned because the checks that raise it sit deep in the
 * write transaction — ownership resolution, geometry source lookup — where
 * threading a result type back out would obscure the happy path.
 *
 * The status set is the union of what the domains raise: `400` for a payload
 * the domain could not use, `403` for a row the actor may not reach, `404` for
 * one that is not theirs to see. `reason` is set where the client can act on
 * the distinction; the four surveillance domains never set it.
 */
export class CommandError extends Error {
	constructor(
		readonly status: 400 | 403 | 404,
		readonly body: { readonly error: string; readonly reason?: string },
	) {
		super(body.error);
	}
}

/**
 * Turn the two refusals a command endpoint can raise into responses.
 *
 * Anything else rethrows: an error nobody declared is a bug, and a 500 with a
 * stack is more useful than a 400 that hides it.
 */
export function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	if (error instanceof RecordDeleteBlockedError) {
		return context.json(deleteBlockedBody(error), 409);
	}
	throw error;
}
