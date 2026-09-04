/**
 * One endpoint per table, dispatching on the commands a write says it means.
 *
 * The existing command routes encode the command in the URL and the verb:
 * `POST /larval-surveillance/habitats` is `createHabitat`, and a PATCH decides
 * between five commands by reading which fields are present. That inference is
 * what makes a payload's shape load-bearing — an extra key becomes an extra
 * command — and it is what these routes remove. Three routes per table, and the
 * body names what it wants:
 *
 * ```
 * POST   /commands/habitats            { intents: ['larvalSurveillance.createHabitat'], … }
 * PATCH  /commands/habitats/{id}       { intents: ['…updateHabitatDetails'], habitat_name: '…' }
 * DELETE /commands/habitats/{id}       { intents: ['larvalSurveillance.deleteHabitat'] }
 * ```
 *
 * ## Why `intents` is a list
 *
 * One save can mean more than one command against the same row: renaming a
 * Habitat and redrawing its geometry is `updateHabitatDetails` and
 * `updateHabitatLocation`. The client cannot send those as two writes — TanStack
 * DB merges two updates to one key and keeps only the later metadata, so one
 * command's name would arrive carrying the other's fields. So it sends both
 * names over one payload, and every named builder reads the fields it takes and
 * ignores the rest.
 *
 * That costs nothing here: `runCommands` already accepts a list and commits it in
 * one transaction, which is how a multi-command PATCH works today.
 *
 * ## Authorization runs before anything is built
 *
 * The old routes could only check a role once the command existed, because the
 * command's `type` was the only place the name appeared. Here the names arrive in
 * the request, so a role that may not send them is refused before a builder runs.
 * The check is the same `denyUnauthorizedAgencyCommands` and the same map; only
 * its position moved.
 *
 * ## What a table has to supply
 *
 * The writer and the response shape it already had — `runCommands` takes both
 * unchanged — plus a map from each command it accepts to a builder. The builder
 * is where a column name becomes a domain argument, which is the one thing that
 * cannot be shared: the body speaks Postgres and the domain speaks its own
 * vocabulary.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
// The client derives the same path from the same function, so the route the
// server registers and the URL a collection posts to cannot drift apart.
import { commandPathFor } from '@simmer-mosquito/sync';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables, OperatorAuthContext } from '../auth-middleware.js';
import {
	type AgencyContext,
	agencyCommandContext,
	type CommandContext,
	readJsonObject,
} from '../command-endpoint.js';
import type { CommandPayload, CommandTable } from '../command-payload.js';
import {
	type AgencyCommandType,
	denyUnauthorizedAgencyCommands,
	readCommandPermission,
} from '../command-permissions.js';
import {
	type RunCommandsConfig,
	runCommands,
	runOperatorCommands,
	type WritableCommand,
} from '../command-write.js';

/**
 * What every builder in a table's map is handed.
 *
 * Generic in the table, so the payload is that table's columns and nothing
 * else. `TArgument` is the keys a table's commands read that are not its own
 * columns, declared at the factory's return type; see {@link CommandPayload}.
 */
export interface IntentRequest<TTable extends CommandTable, TArgument extends string = never> {
	/**
	 * The body without `intents`, keyed by Postgres column name.
	 *
	 * Shared by every command the request named rather than split between them,
	 * because a builder already takes the fields it wants and ignores the rest —
	 * and a command named with nothing to change is refused by the domain, so a
	 * caller naming one it has no fields for fails loudly rather than silently.
	 */
	readonly payload: CommandPayload<TTable, TArgument>;
	readonly agency: AgencyContext;
	readonly authContext: AuthContext;
	/**
	 * The row this write names.
	 *
	 * The path parameter on PATCH and DELETE. On POST there is no path parameter,
	 * so it is the client-generated `id` in the body — which is the same value,
	 * because SIMMER writes carry their own ids so they are replay-safe.
	 */
	readonly id: string;
}

export type IntentBuilder<
	TTable extends CommandTable,
	TCommand,
	TArgument extends string = never,
> = (request: IntentRequest<TTable, TArgument>) => TCommand;

/**
 * The commands one table accepts.
 *
 * Keyed by `AgencyCommandType` rather than `string`, so a typo is a build error
 * and the names that come back out are already known to the permission map.
 * Partial because no table accepts the whole vocabulary.
 */
export type IntentMap<
	TTable extends CommandTable,
	TCommand,
	TArgument extends string = never,
> = Readonly<Partial<Record<AgencyCommandType, IntentBuilder<TTable, TCommand, TArgument>>>>;

export interface TableCommands<
	TTable extends CommandTable,
	TCommand extends WritableCommand,
	TRow,
	TArgument extends string = never,
> {
	/** The Postgres table. Names the routes, and is what the client's collection id is. */
	readonly table: TTable;
	/** Omitted means `'agency'`, which is every table but the global catalogs. */
	readonly actor?: 'agency';
	readonly run: RunCommandsConfig<TCommand, TRow>;
	readonly intents: IntentMap<TTable, TCommand, TArgument>;
}

/**
 * What an operator-scoped builder is handed.
 *
 * No `agency`, because there is none: the commands these tables carry extend
 * `OperatorFoundationCommandInput`, which is `{ operatorUserId }` and nothing
 * else. `genera` and `species` have no `organization_id` and every agency reads
 * them, so an organization is not a thing a caller could sensibly supply.
 */
export interface OperatorIntentRequest<
	TTable extends CommandTable,
	TArgument extends string = never,
> {
	readonly payload: CommandPayload<TTable, TArgument>;
	/** The SIMMER `users` row behind the operator session. */
	readonly operatorUserId: string;
	readonly operatorContext: OperatorAuthContext;
	readonly id: string;
}

export interface OperatorTableCommands<
	TTable extends CommandTable,
	TCommand extends WritableCommand,
	TRow,
	TArgument extends string = never,
> {
	readonly table: TTable;
	readonly actor: 'operator';
	readonly run: RunCommandsConfig<TCommand, TRow>;
	readonly intents: Readonly<
		Partial<
			Record<AgencyCommandType, (request: OperatorIntentRequest<TTable, TArgument>) => TCommand>
		>
	>;
}

export type AnyTableCommands<
	TTable extends CommandTable,
	TCommand extends WritableCommand,
	TRow,
	TArgument extends string = never,
> =
	| TableCommands<TTable, TCommand, TRow, TArgument>
	| OperatorTableCommands<TTable, TCommand, TRow, TArgument>;

/** The names a request said it meant, or why the list could not be read. */
type IntentsResult =
	| { readonly ok: true; readonly intents: readonly AgencyCommandType[] }
	| { readonly ok: false; readonly reason: string };

/**
 * Read `intents`, and refuse anything that is not a non-empty list of commands
 * this table accepts.
 *
 * An unknown name is refused by table rather than globally: `retireTrap` is a
 * real command and still nonsense against `habitats`, and saying so names the
 * mistake better than "no such command" would.
 */
function readIntents(
	payload: Record<string, unknown>,
	// Only the names are read, so this fits an agency map and an operator one
	// alike — their builders take different requests, which is not this function's
	// business.
	spec: { readonly table: string; readonly intents: Readonly<Record<string, unknown>> },
): IntentsResult {
	const raw = payload.intents;

	if (!Array.isArray(raw) || raw.length === 0) {
		return { ok: false, reason: 'A command request must carry a non-empty `intents` list.' };
	}

	const intents: AgencyCommandType[] = [];
	for (const name of raw) {
		if (typeof name !== 'string' || name.length === 0) {
			return { ok: false, reason: 'Every entry in `intents` must be a command name.' };
		}
		if (!Object.hasOwn(spec.intents, name)) {
			return { ok: false, reason: `${spec.table} does not accept the command ${name}.` };
		}
		intents.push(name as AgencyCommandType);
	}

	return { ok: true, intents };
}

function withoutIntents(payload: Record<string, unknown>): Record<string, unknown> {
	const { intents: _intents, ...rest } = payload;
	return rest;
}

/**
 * Read the body, authorize, build, and write.
 *
 * `createdStatus` is 201 on the POST and absent elsewhere, matching what the
 * existing endpoints answer.
 */
function tableCommandHandler<
	TTable extends CommandTable,
	TCommand extends WritableCommand,
	TRow,
	TArgument extends string,
>(
	spec: TableCommands<TTable, TCommand, TRow, TArgument>,
	idFrom: (context: CommandContext, payload: Record<string, unknown>) => string,
	createdStatus?: 201,
): (context: CommandContext) => Promise<Response> {
	return async (context) => {
		const parsed = await readJsonObject(context.req);
		if (!parsed.ok) {
			return context.json({ error: 'invalid_payload', reason: parsed.reason }, 400);
		}

		const names = readIntents(parsed.payload, spec);
		if (!names.ok) {
			return context.json({ error: 'unknown_command', reason: names.reason }, 400);
		}

		// Before building, because the names are enough to decide and a role that may
		// not send them should not have its payload validated first.
		const denial = denyUnauthorizedAgencyCommands(
			context,
			names.intents.map((type) => ({ type })),
		);
		if (denial !== null) {
			return denial;
		}

		const payload = withoutIntents(parsed.payload);
		const authContext = context.get('authContext');
		const request: IntentRequest<TTable, TArgument> = {
			// The one cast the surface needs. What arrives is untrusted JSON with no
			// keys the parser can promise, and what a builder reads is the table's
			// columns; the values stay `unknown` either way, so the cast adds no claim
			// about them. It is here rather than at 272 call sites.
			payload: payload as CommandPayload<TTable, TArgument>,
			agency: agencyCommandContext(authContext),
			authContext,
			id: idFrom(context, payload),
		};

		const commands: TCommand[] = [];
		for (const name of names.intents) {
			// Present by construction: `readIntents` refused any name the map lacks.
			const build = spec.intents[name] as IntentBuilder<TTable, TCommand, TArgument>;
			try {
				commands.push(build(request));
			} catch (error) {
				if (!(error instanceof DomainValidationError)) {
					throw error;
				}
				return context.json(
					{ error: 'invalid_command', message: error.message, issues: error.issues },
					400,
				);
			}
		}

		return runCommands(context, spec.run, commands, createdStatus);
	};
}

/**
 * An operator table may only carry operator-scoped commands.
 *
 * Checked once at registration, so the process refuses to start rather than
 * serving a route whose authorization does not match its door. It is what makes
 * the operator write path safe without an agency actor: every command it can
 * reach is settled by {@link decideCommand} at the boundary, and none of them
 * is an ownership rule, so there is no stored row left to check and no agency
 * membership needed to check it against.
 */
function assertOperatorScoped(spec: {
	readonly table: string;
	readonly intents: Readonly<Record<string, unknown>>;
}): void {
	for (const name of Object.keys(spec.intents) as AgencyCommandType[]) {
		const permission = readCommandPermission(name);
		if (permission.kind !== 'operator') {
			throw new Error(
				`${spec.table} is an operator table, but ${name} is a ${permission.kind} command. ` +
					'Map it to `OPERATOR` in command-permissions.ts, or serve the table as an agency table.',
			);
		}
	}
}

function registerOperatorRoutes<
	TTable extends CommandTable,
	TCommand extends WritableCommand,
	TRow,
	TArgument extends string,
>(
	app: Hono<{ Variables: AuthVariables }>,
	operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>,
	spec: OperatorTableCommands<TTable, TCommand, TRow, TArgument>,
): void {
	assertOperatorScoped(spec);
	const path = commandPathFor(spec.table);

	const handler =
		(
			idFrom: (context: CommandContext, payload: Record<string, unknown>) => string,
			created?: 201,
		) =>
		async (context: CommandContext): Promise<Response> => {
			const parsed = await readJsonObject(context.req);
			if (!parsed.ok) {
				return context.json({ error: 'invalid_payload', reason: parsed.reason }, 400);
			}

			const names = readIntents(parsed.payload, spec);
			if (!names.ok) {
				return context.json({ error: 'unknown_command', reason: names.reason }, 400);
			}

			const operatorContext = context.get('operatorContext');
			// The middleware proved the session is SIMMER's; what it cannot prove is
			// that SIMMER has an identity row to attribute the write to, because
			// `localIdentity` is nullable by design. A global catalog edit nobody can
			// be named for is not one to accept.
			if (operatorContext.localIdentity === null) {
				return context.json(
					{
						error: 'operator_identity_required',
						reason: 'This operator has no SIMMER user record to attribute the write to.',
					},
					403,
				);
			}

			const payload = withoutIntents(parsed.payload);
			const request: OperatorIntentRequest<TTable, TArgument> = {
				payload: payload as CommandPayload<TTable, TArgument>,
				operatorUserId: operatorContext.localIdentity.user.id,
				operatorContext,
				id: idFrom(context, payload),
			};

			const commands: TCommand[] = [];
			for (const name of names.intents) {
				const build = spec.intents[name] as (
					r: OperatorIntentRequest<TTable, TArgument>,
				) => TCommand;
				try {
					commands.push(build(request));
				} catch (error) {
					if (!(error instanceof DomainValidationError)) {
						throw error;
					}
					return context.json(
						{ error: 'invalid_command', message: error.message, issues: error.issues },
						400,
					);
				}
			}

			return runOperatorCommands(context, spec.run, commands, created);
		};

	app.post(
		path,
		operatorAuthContextMiddleware,
		handler((_c, p) => stringOrEmpty(p.id), 201),
	);
	app.patch(
		`${path}/:id`,
		operatorAuthContextMiddleware,
		handler((context) => context.req.param('id') as string),
	);
	app.delete(
		`${path}/:id`,
		operatorAuthContextMiddleware,
		handler((context) => context.req.param('id') as string),
	);
}

export function registerTableCommandRoutes<
	TTable extends CommandTable,
	TCommand extends WritableCommand,
	TRow,
	TArgument extends string,
>(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly operatorAuthContextMiddleware?: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	spec: AnyTableCommands<TTable, TCommand, TRow, TArgument>,
): void {
	if (spec.actor === 'operator') {
		if (options.operatorAuthContextMiddleware === undefined) {
			throw new Error(`${spec.table} is an operator table and needs the operator middleware.`);
		}
		registerOperatorRoutes(app, options.operatorAuthContextMiddleware, spec);
		return;
	}

	const path = commandPathFor(spec.table);

	app.post(
		path,
		options.authContextMiddleware,
		// No path parameter on a create, so the row's id is the one the client
		// generated and sent. `readText` is not used because an absent id is the
		// domain's refusal to make, not this layer's.
		tableCommandHandler(spec, (_context, payload) => stringOrEmpty(payload.id), 201),
	);

	app.patch(
		`${path}/:id`,
		options.authContextMiddleware,
		tableCommandHandler(spec, (context) => context.req.param('id') as string),
	);

	app.delete(
		`${path}/:id`,
		options.authContextMiddleware,
		tableCommandHandler(spec, (context) => context.req.param('id') as string),
	);
}

function stringOrEmpty(value: unknown): string {
	return typeof value === 'string' ? value : '';
}
