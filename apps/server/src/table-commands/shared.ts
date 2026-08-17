/**
 * What every intent map needs and no one table owns.
 *
 * Small on purpose. A builder is a translation from column names to domain
 * arguments, and almost nothing about that translation generalizes. Three things
 * do: how a client withholds an acknowledgement, how a client states a location
 * to a command that takes a bare geometry, and how a constraint the database
 * enforces becomes a refusal a person can read.
 */

import { CommandError } from '../command-endpoint.js';

/**
 * An acknowledgement the caller did not withhold.
 *
 * The delete and lifecycle commands take flags a client sets to `false` to say
 * "I have not confirmed this yet"; absent means confirmed, which is what the
 * existing endpoints already do. One reading rather than one per table, so a
 * map that spells it `!== false` and a map that spells it `=== true` cannot
 * both exist.
 */
export function acknowledged(value: unknown): boolean {
	return value !== false;
}

/**
 * The shape a crew drew, out of the location source it was stated as.
 *
 * A mission or assignment execution takes a bare `geometry` override rather than
 * a `locationSource`, because the stop's own ground is the default and the only
 * thing that may replace it is a shape somebody drew. Every other kind — an
 * address, a habitat — is a source those commands have no reader for, and would
 * fall through to the stop's geometry rather than being honoured.
 *
 * Clients still state their location one way, as a `locationSource`, so that a
 * form does not have to know which of the two commands its save will become.
 * Unwrapping it is this reader's job: the distinction is the domain's, and the
 * transport should not make every caller mirror it.
 */
export function drawnGeometry(payload: Record<string, unknown>): unknown {
	const source = payload.locationSource;

	if (typeof source !== 'object' || source === null) {
		return undefined;
	}

	const { kind, geometry } = source as { readonly kind?: unknown; readonly geometry?: unknown };
	return kind === 'geometry' ? geometry : undefined;
}

/** Postgres refusing to orphan a row. */
const FOREIGN_KEY_VIOLATION = '23503';
/** Postgres refusing a second row where a unique index says there may be one. */
const UNIQUE_VIOLATION = '23505';

/** The 409 body a refused write becomes. */
export interface CommandRefusal {
	readonly error: string;
	readonly reason: string;
}

/**
 * A write the database may refuse by rule, said in words.
 *
 * The global catalogs are the case this exists for. Every agency table is
 * soft-deleted and settles its blockers before writing, in `applyRecordDeletion`,
 * so a refusal there is a `RecordDeleteBlockedError` raised by a read. `genera`,
 * `species` and `units` have no `deleted_at` and lean on their constraints
 * instead — a foreign key for "still in use", three unique indexes on `units` for
 * "that one already exists" — so the answer only exists once the statement has
 * run.
 *
 * Left unhandled that is a 500 with a plain-text body, which the console can only
 * report as "Server response was unreadable" about a rule its own confirmation
 * dialog had just explained.
 *
 * Only the codes a caller passes a refusal for are translated. Anything else
 * rethrows, because a write that failed for some other reason is not a rule being
 * enforced, and reporting a dropped connection as "already in use" sends an
 * operator looking for a row that is not there.
 */
export async function refusableWrite<TResult>(
	run: () => Promise<TResult>,
	refusals: {
		/** `23503` — something still references this row. */
		readonly inUse?: CommandRefusal;
		/** `23505` — a unique index already holds this value. */
		readonly duplicate?: CommandRefusal;
	},
): Promise<TResult> {
	try {
		return await run();
	} catch (error) {
		const refusal = refusalFor(error, refusals);
		if (refusal !== null) {
			throw new CommandError(409, refusal);
		}

		throw error;
	}
}

function refusalFor(
	error: unknown,
	refusals: {
		readonly inUse?: CommandRefusal;
		readonly duplicate?: CommandRefusal;
	},
): CommandRefusal | null {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return null;
	}

	const code = (error as { readonly code: unknown }).code;
	if (code === FOREIGN_KEY_VIOLATION) {
		return refusals.inUse ?? null;
	}
	if (code === UNIQUE_VIOLATION) {
		return refusals.duplicate ?? null;
	}

	return null;
}
