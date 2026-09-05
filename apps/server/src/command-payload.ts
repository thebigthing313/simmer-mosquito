/**
 * Readers for the untrusted JSON a command endpoint receives.
 *
 * These sat in a per-domain copy in every `*-commands/shared.ts` and in several
 * of the standalone command modules — 36 copies of four functions, byte for
 * byte. They are the first thing every write endpoint touches, so a change to
 * what counts as an empty string or a usable number has to land in one place.
 *
 * Context-free by design: nothing here knows about the organization, the actor,
 * or the command being built. Ownership, role, and lifecycle checks belong in
 * the command handlers (see `docs/domain-command-contract.md`); these only turn
 * `unknown` into a typed value or nothing.
 *
 * {@link CommandPayload} is the shape those readers are pointed at, and it is
 * what makes a column name a compile-time question rather than a script's.
 */

import type { ServerOwnedColumns, SimmerDatabase } from '@simmer-mosquito/db';
import type { Acknowledgement } from '@simmer-mosquito/domain';
import { isExplicitAcknowledgement } from './acknowledgements.js';

/** A table the command surface can serve. Every table Kysely knows about. */
export type CommandTable = keyof SimmerDatabase;

/**
 * A column of the table, as a body spells it.
 *
 * Not every column: `ServerOwnedColumns` comes off, so a handler reading
 * `organization_id` fails `tsc` rather than taking the organization off the
 * request. The set is generated beside the table types and the rule behind it
 * is `SERVER_OWNED` in `scripts/generate-table-types.mjs` (#478).
 *
 * Distributive, so a factory serving several tables at once answers to the
 * union of their columns rather than the intersection. `org-lookups.ts` is why:
 * three catalogs share one reader, `custom_schema` is on two of them, and the
 * intersection would refuse the key the factory has to read. Each catalog still
 * states which of the two it has, and `org-lookups.test.ts` holds it to that.
 */
export type ColumnOf<TTable extends CommandTable> = TTable extends CommandTable
	? Exclude<Extract<keyof SimmerDatabase[TTable], string>, ServerOwnedColumns[TTable]>
	: never;

/**
 * The body of a `/commands/{table}` write, keyed by what that table accepts.
 *
 * A body's keys are two languages and the case tells them apart, which
 * `docs/domain-command-contract.md` states in full. This is the same rule as a
 * type:
 *
 * - **`snake_case` names a column**, and the columns come from
 *   `SimmerDatabase`, generated from `packages/db/schema.sql`, less the ones the
 *   server owns. A key the table has no column for does not compile, a key the
 *   server computes does not compile, and a migration that renames a column
 *   fails the build at every handler still reading the old name.
 * - **`camelCase` names anything else**: an acknowledgement, an instruction
 *   such as `locationSource`, or an argument that becomes a different record.
 *   The acknowledgements come from the vocabulary in `packages/domain`, so
 *   every table has them and a misspelling does not compile. Everything else is
 *   `TArgument`, declared by the table at its factory's return type, which is
 *   the declaration site those keys did not have.
 *
 * A handful of `snake_case` keys are columns of *another* record: a Mission
 * planned from a Route arrives with its stops, an Assignment carries `route_id`.
 * Those go in `TArgument` too, and stay `snake_case`, because they are column
 * names and a reader would take a `camelCase` spelling for an instruction.
 *
 * Values are `unknown`, because the body is untrusted JSON, and every key is
 * optional, because a body may omit any of them. Absence is a runtime question
 * and the answer is `=== undefined`: `JSON.parse` never produces `undefined`, so
 * a key that reads `undefined` is a key the body did not carry. That is the same
 * question `'key' in payload` used to ask, and unlike `in`, which takes any
 * string, it goes through the property access the compiler checks.
 *
 * A reader shared by several tables takes the values rather than the payload,
 * so the key is named where the table is known. `readEntityTarget` wants
 * `entity_type` and `entity_id`, and handed a whole payload it could only ask
 * for a shape every payload satisfies.
 */
export type CommandPayload<TTable extends CommandTable, TArgument extends string = never> = {
	readonly [TKey in ColumnOf<TTable> | Acknowledgement | TArgument]?: unknown;
};

/**
 * A body an acknowledgement can be read off, whatever else it carries.
 *
 * Optional keys rather than required, so the older per-domain routes can pass
 * the `Record<string, unknown>` they still hold. A {@link CommandPayload}
 * satisfies it by construction, since every table carries the whole vocabulary.
 */
export type AcknowledgementPayload = { readonly [TFlag in Acknowledgement]?: unknown };

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
 * Whether the caller has answered an acknowledgement.
 *
 * Two postures, and the flag picks which. Most flags read `!== false`: absent
 * means confirmed, which is what the endpoints did before any of them was read,
 * so a client that has never heard of a flag behaves as it always did. The four
 * in `EXPLICIT_ACKNOWLEDGEMENTS` read `=== true`, because the question they ask
 * cannot arrive pre-answered.
 *
 * The flag is a parameter rather than the posture, which is the whole point.
 * This used to take the value alone and answer `!== false`, and its docstring
 * said "a door that spells it `!== false` and a door that spells it `=== true`
 * cannot both exist" while four call sites spelled it `=== true` by hand. Both
 * doors existed, and which one a new command walked through was whichever
 * reader its author happened to copy. Now the posture is a property of the flag,
 * declared once beside what reads it, and no call site chooses (#426).
 *
 * The name is checked against the vocabulary, so a misspelled flag does not
 * compile. It used to read `undefined` off the payload and answer "confirmed".
 */
export function acknowledged(payload: AcknowledgementPayload, flag: Acknowledgement): boolean {
	return isExplicitAcknowledgement(flag) ? payload[flag] === true : payload[flag] !== false;
}

/**
 * The keys the two execution-option readers take off a body.
 *
 * Optional rather than required, because both readers are shared with the older
 * per-domain routes, whose payload is still a `Record<string, unknown>` that no
 * required key would accept. That makes these two the declaration site for
 * `completeAssignmentItem` and its three siblings: a table that calls a reader
 * does not have to name them itself.
 */
type ExecutionOptionPayload = AcknowledgementPayload & {
	readonly completeAssignmentItem?: unknown;
	readonly autoStartAssignment?: unknown;
	readonly completeMissionItem?: unknown;
	readonly autoStartMission?: unknown;
};

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
 * one. Both take the default posture, so a withheld flag is an explicit `false`
 * and nothing else. They used to be read as `=== true` here and refused with a
 * lifecycle code of their own, which was a second reading of the same question
 * and the door #317 left open.
 */
export function readExecutionOptions(payload: ExecutionOptionPayload): {
	readonly completeAssignmentItem?: boolean;
	readonly autoStartAssignment?: boolean;
	readonly acknowledgedCompletedItemAdditionalRecord: boolean;
	readonly acknowledgedTargetMismatch: boolean;
} {
	return {
		...(payload.completeAssignmentItem === false ? { completeAssignmentItem: false } : {}),
		...(payload.autoStartAssignment === false ? { autoStartAssignment: false } : {}),
		acknowledgedCompletedItemAdditionalRecord: acknowledged(
			payload,
			'acknowledgedCompletedItemAdditionalRecord',
		),
		acknowledgedTargetMismatch: acknowledged(payload, 'acknowledgedTargetMismatch'),
	};
}

/**
 * The same group for a mission stop.
 *
 * Separate from {@link readExecutionOptions} rather than shared with it because
 * the two carry different acknowledgements — a mission stop has ground to cover
 * and a requested action to agree with, an assignment stop has a typed target —
 * and folding them together would offer each side flags it cannot honour.
 *
 * Its three acknowledgements are the ones an absent value does not answer, so
 * they go through {@link acknowledged} and come back `=== true`. That reading is
 * unchanged; what changed is where it is written down. It used to be spelled out
 * here, contradicting `acknowledged`'s own docstring next door, and now it is
 * `EXPLICIT_ACKNOWLEDGEMENTS` naming the three flags (#426).
 */
export function readMissionExecutionOptions(payload: ExecutionOptionPayload): {
	readonly completeMissionItem?: boolean;
	readonly autoStartMission?: boolean;
	readonly acknowledgedMissionGeometryNotCovered?: boolean;
	readonly acknowledgedRequestedActionMismatch?: boolean;
	readonly acknowledgedCompletedItemAdditionalAction?: boolean;
} {
	return {
		...(payload.completeMissionItem === false ? { completeMissionItem: false } : {}),
		...(payload.autoStartMission === false ? { autoStartMission: false } : {}),
		...(acknowledged(payload, 'acknowledgedMissionGeometryNotCovered')
			? { acknowledgedMissionGeometryNotCovered: true }
			: {}),
		...(acknowledged(payload, 'acknowledgedRequestedActionMismatch')
			? { acknowledgedRequestedActionMismatch: true }
			: {}),
		...(acknowledged(payload, 'acknowledgedCompletedItemAdditionalAction')
			? { acknowledgedCompletedItemAdditionalAction: true }
			: {}),
	};
}
