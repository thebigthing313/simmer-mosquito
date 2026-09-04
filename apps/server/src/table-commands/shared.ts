/**
 * What every intent map needs and no one table owns.
 *
 * Small on purpose. A builder is a translation from column names to domain
 * arguments, and almost nothing about that translation generalizes. Four things
 * do: how a client withholds an acknowledgement, how a client states a location
 * to a command that takes a bare geometry, how a polymorphic table's target is
 * read out of its two columns, and how a constraint the database enforces
 * becomes a refusal a person can read.
 */

import { fromDbEntityType } from '@simmer-mosquito/domain';
import { CommandError } from '../command-endpoint.js';
import { readText } from '../command-payload.js';

/**
 * Whether the caller has answered an acknowledgement.
 *
 * Takes the flag's name and looks its posture up, so a map cannot spell one
 * `!== false` and another `=== true` by hand. Which flags read which way is in
 * `EXPLICIT_ACKNOWLEDGEMENTS`; see `command-payload.ts`.
 */
export { acknowledged } from '../command-payload.js';

/**
 * The ids a command is being told to act on, with anything malformed kept.
 *
 * `readStringArray` filters non-strings out, which is right for a list where a
 * bad entry means nothing. It is wrong for a merge: a body carrying
 * `[uuid, 123]` would fold one record away and answer as though it had folded
 * two, and there is no undo. Substituting an empty string keeps the entry in
 * place so the domain's own uuid check refuses it, and the 400 names the index
 * rather than the request quietly doing less than it was asked.
 *
 * A value that is not an array at all is an empty list, and the domain refuses
 * that too, because every command taking one of these requires at least one id.
 */
export function readIdList(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.map((entry) => (typeof entry === 'string' ? entry : '')) : [];
}

/**
 * The record a polymorphic row hangs off, out of the two columns that hold it.
 *
 * `comments`, `tag_items` and `additional_personnel` all point at a record with
 * an `entity_type`/`entity_id` pair, and all three hold the discriminator in
 * snake_case (`source_reduction`) while the domain's target vocabulary is
 * camelCase (`sourceReduction`). A client writing one of these through a sync
 * collection sends the column's spelling, so `fromDbEntityType` turns it back.
 * A caller sending the camelCase form is honoured too, since converting a value
 * with no underscores changes nothing.
 *
 * The type is cast rather than narrowed, as `readTarget` does on the legacy
 * routes. This is untrusted text, and *which* target types a command accepts
 * differs per table — comments take more than tags do — so the domain's own
 * `validateTarget` is what checks it, against that command's list, and names it
 * when it is wrong. Narrowing here would be a second copy of three lists, and
 * the copy that goes stale.
 *
 * It takes the two values rather than the payload, so `entity_type` is spelled
 * in the module whose table has the column and the compiler checks it there.
 */
export function readEntityTarget(
	entityType: unknown,
	entityId: unknown,
): {
	readonly type: never;
	readonly id: string;
} {
	return {
		type: fromDbEntityType(readText(entityType) ?? '') as never,
		id: readText(entityId) ?? '',
	};
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
 *
 * It takes the source rather than the payload, so `locationSource` is spelled in
 * the module that declares it as one of its keys.
 */
export function drawnGeometry(source: unknown): unknown {
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
