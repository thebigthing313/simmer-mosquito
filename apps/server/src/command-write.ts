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
import { CommandError } from './command-endpoint.js';
import { resolveCommandOwnership } from './command-ownership.js';
import type { AgencyCommandType, CommandActor } from './command-permissions.js';

export type CommandDb = Kysely<SimmerDatabase>;
export type CommandTransaction = Transaction<SimmerDatabase>;

/** The shape the write loop needs of a command: enough to authorize it. */
export interface WritableCommand {
	readonly type: AgencyCommandType;
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
export async function writeCommands<TCommand extends WritableCommand, TSafe>(
	db: CommandDb,
	actor: CommandActor,
	commands: readonly TCommand[],
	write: (trx: CommandTransaction, command: TCommand) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
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
