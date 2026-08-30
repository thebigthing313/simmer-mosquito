/**
 * Readers for the untrusted JSON a command endpoint receives.
 *
 * These sat in a per-domain copy in every `*-commands/shared.ts` and in several
 * of the standalone command modules — 36 copies of four functions, byte for
 * byte. They are the first thing every write endpoint touches, so a change to
 * what counts as an empty string or a usable number has to land in one place.
 *
 * Context-free by design: nothing here knows about the agency, the actor, or
 * the command being built. Ownership, role, and lifecycle checks belong in the
 * command handlers (see `docs/domain-command-contract.md`); these only turn
 * `unknown` into a typed value or nothing.
 */

/** Narrow an unknown to a plain object — not an array, not null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A non-empty trimmed string, or null.
 *
 * Whitespace-only is null rather than `''`: a field a user tabbed through is
 * absent, not set to blank.
 */
export function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

/**
 * The same reading, named for the columns it feeds.
 *
 * Kept distinct from {@link readText} so a nullable column's mapping still says
 * so at the call site.
 */
export function readNullableText(value: unknown): string | null {
	return readText(value);
}

/**
 * A string as it arrived, or the empty string.
 *
 * Distinct from `readText`, which trims and answers `null`. This one is for the
 * required ids that a domain builder is about to validate: handing it `''` makes
 * the builder refuse and name the field, where `null` would need a second check
 * here saying the same thing worse.
 */
export function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** A finite number, or undefined. NaN and Infinity are not values. */
export function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * An acknowledgement the caller did not withhold.
 *
 * The delete and lifecycle commands take flags a client sets to `false` to say
 * "I have not confirmed this yet"; absent means confirmed, which is what the
 * endpoints already did before any of them was read. One reading rather than
 * one per route, so a door that spells it `!== false` and a door that spells it
 * `=== true` cannot both exist.
 *
 * This lived in `table-commands/shared.ts` while the per-table endpoints were
 * the only ones asking. The per-domain routes hard-coded `true` instead, which
 * is the half of #165 that made the flags unaskable: a route that has decided
 * the answer is not carrying a question.
 */
export function acknowledged(value: unknown): boolean {
	return value !== false;
}

/**
 * The flags an assignment-execution write carries alongside the record.
 *
 * Read as a group because they travel as a group, and because the two defaults
 * that matter are defaults the *domain* sets, not this layer: omitting
 * `completeAssignmentItem` means "yes, close the stop". Only an explicit
 * `false` turns it off, so a client that has never heard of these flags gets
 * the behaviour the field wants.
 *
 * The two acknowledgements go through {@link acknowledged} like every other
 * one, so a withheld flag is an explicit `false` and nothing else. They used to
 * be read as `=== true` here and refused with a lifecycle code of their own,
 * which was a second reading of the same question and the door #317 left open.
 */
export function readExecutionOptions(payload: Record<string, unknown>): {
	readonly completeAssignmentItem?: boolean;
	readonly autoStartAssignment?: boolean;
	readonly acknowledgedCompletedItemAdditionalRecord: boolean;
	readonly acknowledgedTargetMismatch: boolean;
} {
	return {
		...(payload.completeAssignmentItem === false ? { completeAssignmentItem: false } : {}),
		...(payload.autoStartAssignment === false ? { autoStartAssignment: false } : {}),
		acknowledgedCompletedItemAdditionalRecord: acknowledged(
			payload.acknowledgedCompletedItemAdditionalRecord,
		),
		acknowledgedTargetMismatch: acknowledged(payload.acknowledgedTargetMismatch),
	};
}

/**
 * The same group for a mission stop.
 *
 * Separate from {@link readExecutionOptions} rather than shared with it because
 * the two carry different acknowledgements — a mission stop has ground to cover
 * and a requested action to agree with, an assignment stop has a typed target —
 * and folding them together would offer each side flags it cannot honour.
 */
export function readMissionExecutionOptions(payload: Record<string, unknown>): {
	readonly completeMissionItem?: boolean;
	readonly autoStartMission?: boolean;
	readonly acknowledgedMissionGeometryNotCovered?: boolean;
	readonly acknowledgedRequestedActionMismatch?: boolean;
	readonly acknowledgedCompletedItemAdditionalAction?: boolean;
} {
	return {
		...(payload.completeMissionItem === false ? { completeMissionItem: false } : {}),
		...(payload.autoStartMission === false ? { autoStartMission: false } : {}),
		...(payload.acknowledgedMissionGeometryNotCovered === true
			? { acknowledgedMissionGeometryNotCovered: true }
			: {}),
		...(payload.acknowledgedRequestedActionMismatch === true
			? { acknowledgedRequestedActionMismatch: true }
			: {}),
		...(payload.acknowledgedCompletedItemAdditionalAction === true
			? { acknowledgedCompletedItemAdditionalAction: true }
			: {}),
	};
}
