/**
 * The plumbing every agency command endpoint shares once authorization is done.
 *
 * A command endpoint is the same shape in all seven agency domains: read the
 * body, map it onto a domain command, run that command in a transaction, and
 * turn any refusal into a typed 4xx. Only the mapping and the runner differ
 * between endpoints; everything around them was copy-pasted 95 times.
 *
 * What deliberately does *not* live here is `authContextMiddleware`. It stays
 * written at each route registration so that someone auditing whether a write
 * endpoint is authorized can see it there, rather than having to open this file
 * to find out. This module owns only what happens after authorization is
 * established.
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
import { DomainValidationError } from '@simmer-mosquito/domain';
import type { Context } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';
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

// ===========================================================================
// Building commands
// ===========================================================================

/** The 400 body a domain builder's rejection becomes. */
export type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

/** One command, or the refusal that stopped it being built. */
export type CommandResult<TCommand> =
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody };

/** The commands an endpoint will run, or the refusal that stopped it building them. */
export type CommandsResult<TCommand> =
	| { readonly ok: true; readonly commands: readonly TCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

/**
 * Run a domain builder and turn its rejection into a body rather than a throw.
 *
 * Domain builders signal a context-free violation — a missing field, an
 * out-of-range number — by throwing `DomainValidationError`. The endpoints want
 * that as a 400 with the issue list attached, and want anything else to keep
 * propagating.
 */
export function createCommand<TCommand>(build: () => TCommand): CommandResult<TCommand> {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return { ok: false, body: invalidCommandBody(error) };
		}
		throw error;
	}
}

function invalidCommandBody(error: DomainValidationError): InvalidCommandBody {
	return { error: 'invalid_command', message: error.message, issues: error.issues };
}

/** The refusal a PATCH gets when its payload changed nothing. */
export function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

/** The two fields every agency command carries, read off the resolved session. */
export type AgencyContext = { readonly organizationId: string; readonly actorProfileId: string };

export function agencyCommandContext(authContext: AuthContext): AgencyContext {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

// ===========================================================================
// The endpoint itself
// ===========================================================================

export type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

/**
 * Parse a request body that has to be a JSON object.
 *
 * Exported for `table-commands/dispatch.ts`, which reads a body the same way and
 * then does something different with it — the `intents` list decides which
 * builders run, so it cannot go through {@link commandEndpoint}'s single `build`.
 */
export async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

/**
 * A hand-written payload reader's verdict: the typed shape, or why the body
 * could not be read as one.
 *
 * Distinct from {@link CommandResult}, and the distinction is the response the
 * client gets. A `PayloadResult` failure is `invalid_payload` — the request was
 * not shaped like a request. A `CommandResult` failure is `invalid_command` —
 * the request was well-formed and the domain refused it, with an issue list
 * naming the fields. Collapsing the two would have told a client with a typo in
 * `country` that its command was invalid, and given it no path to look at.
 */
export type PayloadResult<TPayload> =
	| { readonly ok: true; readonly payload: TPayload }
	| { readonly ok: false; readonly reason: string };

/** Everything a payload-to-command mapping is handed. */
export interface CommandRequest<TPayload = Record<string, unknown>> {
	/**
	 * The request body. The raw JSON object by default — `{}` for the endpoints
	 * that take none — or whatever {@link CommandEndpoint.readPayload} narrowed
	 * it to.
	 */
	readonly payload: TPayload;
	/** `organizationId` and `actorProfileId`, ready to spread into a builder. */
	readonly agency: AgencyContext;
	/** The whole resolved session, for the builders that need more than the two ids. */
	readonly authContext: AuthContext;
	/** A path parameter, e.g. `param('trapId')`. */
	readonly param: (name: string) => string;
}

/**
 * How the endpoint treats the request body.
 *
 * `'optional'` is for the deletes that accept a body of acknowledgement flags
 * but do not require one: an absent or unparseable body yields `{}`, so a
 * `payload.acknowledgedX !== false` read defaults to acknowledged either way.
 */
export type CommandBody = 'required' | 'optional' | 'none';

/** What a mapping may hand back. */
export type Built<TCommand> = TCommand | CommandResult<TCommand> | CommandsResult<TCommand>;

export interface CommandEndpoint<TCommand, TPayload = Record<string, unknown>> {
	readonly body?: CommandBody;
	/**
	 * Narrow the JSON object into the shape `build` wants, or say why it could
	 * not be. A refusal is the endpoint's `invalid_payload` 400.
	 *
	 * Omit it and `build` is handed the raw object, which is what most endpoints
	 * want: they read fields straight into a domain builder and let the builder
	 * be the judge. The catalog endpoints read their payloads first because
	 * their builders take already-typed values.
	 */
	readonly readPayload?: (raw: Record<string, unknown>) => PayloadResult<TPayload>;
	/**
	 * Map the request onto the command(s) to run.
	 *
	 * Return the command itself for the common single-command case — a
	 * `DomainValidationError` thrown out of the builder becomes the 400. Return
	 * a {@link CommandsResult} where the mapping decides for itself, as the
	 * multi-field PATCH builders do.
	 */
	readonly build: (request: CommandRequest<TPayload>) => Built<TCommand> | Promise<Built<TCommand>>;
	/** Authorize the commands, write them, and answer. */
	readonly run: (
		context: CommandContext,
		commands: readonly TCommand[],
	) => Response | Promise<Response>;
}

/**
 * Assemble the handler half of a command route.
 *
 * Owns the body read and its `invalid_payload` 400, the agency context, and the
 * `invalid_command` 400 — the four steps that were identical at every call
 * site. The verb, the path, and `authContextMiddleware` stay in the route
 * registration; the mapping and the runner stay in {@link CommandEndpoint}.
 */
export function commandEndpoint<TCommand, TPayload = Record<string, unknown>>(
	endpoint: CommandEndpoint<TCommand, TPayload>,
): (context: CommandContext) => Promise<Response> {
	const body = endpoint.body ?? 'required';
	return async (context) => {
		let raw: Record<string, unknown> = {};
		if (body !== 'none') {
			const parsed = await readJsonObject(context.req);
			if (parsed.ok) {
				raw = parsed.payload;
			} else if (body === 'required') {
				return context.json({ error: 'invalid_payload', reason: parsed.reason }, 400);
			}
		}

		// Without a reader the two are the same type; the default type parameter
		// is what makes that true, and the cast is what tells the compiler so.
		let payload = raw as TPayload;
		if (endpoint.readPayload !== undefined) {
			const read = endpoint.readPayload(raw);
			if (!read.ok) {
				return context.json({ error: 'invalid_payload', reason: read.reason }, 400);
			}
			payload = read.payload;
		}

		const authContext = context.get('authContext');
		let built: Built<TCommand>;
		try {
			built = await endpoint.build({
				payload,
				agency: agencyCommandContext(authContext),
				authContext,
				// Hono widens `param` to `string | undefined` when it cannot see the
				// path; every name read here appears in the path it was registered
				// with, so it is always present.
				param: (name) => context.req.param(name) as string,
			});
		} catch (error) {
			if (!(error instanceof DomainValidationError)) {
				throw error;
			}
			return context.json(invalidCommandBody(error), 400);
		}

		const resolved = toCommandsResult(built);
		if (!resolved.ok) {
			return context.json(resolved.body, 400);
		}
		return endpoint.run(context, resolved.commands);
	};
}

/**
 * Tell a built command apart from a result wrapping one.
 *
 * A domain command is `{ type, payload }` and never carries `ok`, so the
 * presence of that key is an unambiguous discriminator; `commands` then
 * separates the many-command result from the single-command one.
 */
function toCommandsResult<TCommand>(built: Built<TCommand>): CommandsResult<TCommand> {
	if (typeof built !== 'object' || built === null || !('ok' in built)) {
		return { ok: true, commands: [built as TCommand] };
	}
	const result = built as CommandResult<TCommand> | CommandsResult<TCommand>;
	if (!result.ok) {
		return result;
	}
	return 'commands' in result ? result : { ok: true, commands: [result.command] };
}
