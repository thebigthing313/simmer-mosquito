/**
 * The write transaction every agency command endpoint commits through.
 *
 * Five families had a `writeCommands` of their own and two more opened the loop
 * inline, which left the ownership check optional by accident: three of the five
 * took an `actor` and asserted ownership inside the loop, and two declared the
 * same function without one and never called it. That difference is invisible at
 * the call site, and the failure it allows is quiet — `authorizeCommands` denies
 * only on `'deny'`, and a collector holding an ownership-kind permission decides
 * to `'ownership'`, deliberately, because the row check belongs in the
 * transaction. A command whose write loop does not run that check therefore
 * passes the route boundary and is never checked anywhere.
 *
 * One loop, `actor` required, `assertCommandOwnership` called for every command,
 * makes that unrepresentable. `field-work-commands/shared.ts` already made this
 * argument for its own copy; this is the same argument applied everywhere.
 *
 * Calling the resolver unconditionally is cheap: `resolveCommandOwnership`
 * answers `allowed` without touching the database for every permission that is
 * not an ownership rule.
 */

import {
	type Kysely,
	type MutationWriteResult,
	readCurrentTransactionId,
	type SimmerDatabase,
	type Transaction,
} from '@simmer-mosquito/db';

import type { AuthContext } from './auth-context.js';
import { type CommandContext, CommandError, handleCommandError } from './command-endpoint.js';
import { resolveCommandOwnership } from './command-ownership.js';
import {
	authorizeCommands,
	type CommandActor,
	denyUnauthorizedOrganizationCommands,
	type OrganizationCommandType,
} from './command-permissions.js';

export type CommandDb = Kysely<SimmerDatabase>;
export type CommandTransaction = Transaction<SimmerDatabase>;

/** The shape the write loop needs of a command: enough to authorize it. */
export interface WritableCommand {
	readonly type: OrganizationCommandType;
	readonly payload: unknown;
}

export function commandActor(authContext: AuthContext): CommandActor {
	return { role: authContext.role, profileId: authContext.profile.id };
}

/**
 * Commit a batch of commands, checking each against the row it names first.
 *
 * `actor` is required rather than optional so ownership cannot be skipped by
 * omission: a caller with no actor to pass cannot compile.
 *
 * The result carries the last row written and the transaction id the client
 * waits on before trusting its optimistic mutation.
 */
export async function writeCommands<TCommand extends WritableCommand, TRow>(
	db: CommandDb,
	actor: CommandActor,
	commands: readonly TCommand[],
	write: (trx: CommandTransaction, command: TCommand) => Promise<TRow | null>,
): Promise<MutationWriteResult<TRow | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TRow | null = null;
		for (const command of commands) {
			await assertCommandOwnership(trx, command, actor);
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

/**
 * The row-level half, raised as the shared `CommandError`.
 *
 * Private to this module: the only way to reach it is through `writeCommands`,
 * which is the point — a handler cannot forget to call what it cannot call.
 */
async function assertCommandOwnership(
	trx: CommandTransaction,
	command: WritableCommand,
	actor: CommandActor,
): Promise<void> {
	const outcome = await resolveCommandOwnership(trx, command, actor);
	if (outcome.kind === 'missing') {
		throw new CommandError(404, { error: `${outcome.entity}_not_found` });
	}
	if (outcome.kind === 'refused') {
		throw new CommandError(403, { error: 'forbidden', reason: outcome.reason });
	}
}

// ===========================================================================
// Payload readers
// ===========================================================================

/**
 * A date from a command payload, or null when there isn't one.
 *
 * Five families carried this, four returning `null` and `adult-surveillance`
 * returning `undefined`. Both were assignable everywhere it was used — the
 * domain's convention for an optional date input is `?: Date | null` — so
 * standardising on the majority changed nothing that is written.
 */
export function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function readStringArray(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

export function readNumberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Today, as the calendar date the operational columns are keyed by. */
export function nowLocalDate(): string {
	return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// The write tail
// ===========================================================================

/**
 * What varies between one command endpoint's write tail and another's.
 *
 * Three values: which writer commits the batch, what to call the row when there
 * isn't one, and what key to return it under.
 */
export interface RunCommandsConfig<TCommand extends WritableCommand, TRow> {
	readonly db: CommandDb;
	readonly write: (trx: CommandTransaction, command: TCommand) => Promise<TRow | null>;
	/** The 404 body's `error`, e.g. `region_folder_not_found`. */
	readonly notFound: string;
	/** The response key the row is returned under, e.g. `regionFolder`. */
	readonly key: string;
	/** Only `memberships` has one — see {@link SecondSystem}. */
	readonly secondSystem?: SecondSystem<TCommand>;
}

/**
 * The half of a command that is not Postgres.
 *
 * One table has one. `memberships` writes SIMMER's row *and* settles the grant a
 * session is refreshed against, which lives in WorkOS, and ADR 0013 admits that
 * under a rule about order: the row is written first on a create and last on a
 * revoke. Revoking in Postgres first leaves somebody who reads as removed and can
 * still sign in; mailing an invitation first sends a working link to somebody the
 * agency has no row for.
 *
 * So it is two hooks rather than one, and which one a command uses *is* which
 * side of the transaction it belongs on. Neither runs inside it: a transaction
 * that has not committed is not a fact the second system should be agreeing with,
 * and holding one open across a network call to another provider is its own
 * problem.
 *
 * Either may throw `CommandError`, which is answered the same way a refusal from
 * inside the write is. A `before` that throws means nothing was written at all,
 * which is the point of it running first.
 *
 * This is deliberately not a template. `docs/domain-command-contract.md` says a
 * command that does not span two systems must not be written as though it might,
 * and the rules above are a cost rather than a shape to copy.
 */
export interface SecondSystem<TCommand extends WritableCommand> {
	readonly before?: (command: TCommand, authContext: AuthContext) => Promise<void>;
	readonly after?: (command: TCommand, authContext: AuthContext) => Promise<void>;
}

/**
 * Authorize, commit, and answer — the seven lines that sat at 28 call sites.
 *
 * The rule worth having in one place is the 404: a write loop that answers
 * `row === null` means "not yours or not there", and both become a 404 named
 * after the entity. Written out per endpoint, that was 28 chances to name the
 * wrong noun — and no way to notice that two of the copies were calling a
 * `writeCommands` which took no actor and so checked no ownership at all.
 *
 * Generalized from `runActionCommands`, which had done exactly this for three
 * of the 28 and never left the file it was written in.
 */
/**
 * The standing of a SIMMER operator, which is no agency standing at all.
 *
 * `viewer` is the floor on purpose: if a command that was not operator-scoped
 * ever reached this path, the role check would refuse it rather than wave it
 * through. `profileId` is empty because an operator has no agency profile —
 * and neither field is ever read, because `resolveCommandOwnership` returns
 * `ALLOWED` for every permission kind but the three ownership ones, and
 * `registerOperatorRoutes` proves at startup that an operator table carries
 * none of those.
 */
const OPERATOR_ACTOR: CommandActor = { role: 'viewer', profileId: '' };

/**
 * The write tail for an operator table.
 *
 * Separate from {@link runCommands} because that one reads an agency
 * `AuthContext` off the request, and an operator session has none — the global
 * catalogs have no `organization_id` for one to scope.
 */
export async function runOperatorCommands<TCommand extends WritableCommand, TRow>(
	context: {
		readonly json: (body: unknown, status?: number) => Response;
	},
	config: RunCommandsConfig<TCommand, TRow>,
	commands: readonly TCommand[],
	createdStatus?: 201,
): Promise<Response> {
	// Belt and braces over the startup assertion: the door already proved this
	// session is SIMMER's, so the only thing left to refuse is a command that
	// should never have been on an operator table.
	const denial = authorizeCommands({ role: 'viewer', isOperator: true }, commands);
	if (denial !== null) {
		return context.json(denial, 403);
	}

	try {
		const result = await writeCommands(config.db, OPERATOR_ACTOR, commands, config.write);
		if (result.row === null) {
			return context.json({ error: config.notFound }, 404);
		}
		return context.json({ [config.key]: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context as never, error);
	}
}

export async function runCommands<TCommand extends WritableCommand, TRow>(
	context: CommandContext,
	config: RunCommandsConfig<TCommand, TRow>,
	commands: readonly TCommand[],
	createdStatus?: 201,
): Promise<Response> {
	const denial = denyUnauthorizedOrganizationCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	const authContext = context.get('authContext');

	try {
		// The revoke side, and every refusal that has to be settled before anything
		// is written. Nothing here for all but one table.
		for (const command of commands) {
			await config.secondSystem?.before?.(command, authContext);
		}

		const result = await writeCommands(
			config.db,
			commandActor(authContext),
			commands,
			config.write,
		);
		if (result.row === null) {
			return context.json({ error: config.notFound }, 404);
		}

		// The create side. The row is committed by the time this runs, which is the
		// whole reason it is out here: a mail that beat its own Membership would
		// reach somebody the agency has no row for.
		for (const command of commands) {
			await config.secondSystem?.after?.(command, authContext);
		}

		// The txid is the transaction's, not the second system's. A client waits on
		// it to know its row has arrived, and the second half writes nothing a client
		// receives — `workos_invitation_id` is withheld from the shape.
		return context.json({ [config.key]: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}
