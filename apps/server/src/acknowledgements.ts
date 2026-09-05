/**
 * What checks each acknowledgement, as a total map over the vocabulary.
 *
 * `ACKNOWLEDGEMENTS` in `packages/domain` is the list of every confirmation a
 * command payload carries. This says, for each one, which mechanism reads it —
 * or names the issue that will make something read it. The map is total by its
 * type, so a flag added to the vocabulary is a compile error here until someone
 * decides, and `pnpm check:acknowledgements` closes the other direction: a map
 * entry naming no payload key fails too.
 *
 * ## The ratchet
 *
 * `UNCHECKED_ACKNOWLEDGEMENTS` is the count of `unchecked` entries, checked in.
 * The gate fails when the real count differs from it, in either direction — up
 * means a branch added an unread flag, down means a branch guarded one and owes
 * the number. It is the same idea as the duplication threshold and the
 * complexity baseline, and the falling number is the progress bar for #316 and
 * everything after it.
 *
 * ## Why "checked by the domain builder" is a real answer
 *
 * Ten flags are enforced by a pure builder that pushes a validation issue unless
 * the flag is `true`, and the caller gets a 400 `invalid_command` naming the
 * flag's path rather than a 409. That is a weaker answer than the 409 — it
 * cannot say how many rows are at stake, because a pure builder cannot count
 * rows — but it is a real refusal, and pretending otherwise would make the
 * ratchet count work that is already done.
 *
 * ## Where a mechanism comes from
 *
 * A new one is added when no existing mechanism can answer a flag's question
 * honestly, not when a handler wants its own function. `historyCheck` is the
 * seventh because none of the six fitted: `clearanceCheck` counts rows a write
 * removes, and a rename removes nothing — reusing it would tell an agency its
 * history was being deleted when it was being relabelled. `collisionCheck` is
 * the eighth for the same reason in the other direction: the rows it counts do
 * not read under the value being written, they compete with it, and its flag
 * takes only an explicit `true`.
 *
 * ## The trap this map does not fix
 *
 * `acknowledged()` in `command-payload.ts` reads an absent flag as confirmed, so
 * every guard below fires only for a client that sends `false` on purpose. No
 * surface does today. That is deliberate — the alternative refuses writes that
 * work now — and #319 is the client half.
 *
 * The six in `EXPLICIT_ACKNOWLEDGEMENTS` are the exception, and that list is
 * further down with the reason for each.
 */

import type { Acknowledgement } from '@simmer-mosquito/domain';

/**
 * How an acknowledgement is read.
 *
 * `unchecked` carries the issue that will settle it, so the map answers "what
 * happens if I withhold this" with either a mechanism or a link.
 */
export type AcknowledgementMechanism =
	/**
	 * The delete registry in `packages/db/src/domains/record-deletion.ts`.
	 * `applyRecordDeletion` counts the rows a rule covers and refuses with
	 * `409 acknowledgement_required` when the flag is not `true`.
	 */
	| { readonly kind: 'deleteRegistry' }
	/**
	 * A pure command builder pushes a validation issue unless the flag is
	 * `true`, so the refusal is a 400 `invalid_command` naming its path.
	 *
	 * These ten get no confirmation dialog in `apps/web`, and that is a decision
	 * rather than an oversight (#319). The dialog is driven by `flag` and
	 * `consequences` on a 409, and a pure builder can produce neither: it guards
	 * a change of *meaning* — what a habitat's configuration says, what a unit
	 * code refers to, which contact a merge keeps — and there is no row count to
	 * put in front of the user. The forms that reach these commands keep asking
	 * their own hard-coded question and keep sending `true`.
	 */
	| { readonly kind: 'domainBuilder' }
	/**
	 * `assertClearanceAcknowledged` counts the rows a non-delete write turns on
	 * — the ones it removes, the ones already there, or the ones it takes out of
	 * use — and refuses with `409 acknowledgement_required`.
	 */
	| { readonly kind: 'clearanceCheck' }
	/**
	 * `requireStateAcknowledgement` reads the record's own stored state and
	 * refuses with `409 acknowledgement_required` and empty `consequences`.
	 */
	| { readonly kind: 'stateGuard' }
	/**
	 * The import's own assessment answers it: the writer counts the rows that
	 * would update or fail before it commits anything, and refuses on that.
	 */
	| { readonly kind: 'importAssessment' }
	/**
	 * `assertHistoryAcknowledged` counts the rows that already read under the
	 * value being changed and refuses with `409 acknowledgement_required`. The
	 * rows are not going anywhere; they will read differently, which is why this
	 * is not the clearance check.
	 */
	| { readonly kind: 'historyCheck' }
	/**
	 * `assertNoColliding` counts the rows that already carry the value being
	 * written and refuses with `409 acknowledgement_required`. One flag uses it,
	 * and it is not a history check: the rows it counts compete with the value
	 * rather than read under it.
	 */
	| { readonly kind: 'collisionCheck' }
	/** Nothing reads it. `issue` is where that gets settled. */
	| { readonly kind: 'unchecked'; readonly issue: number };

const deleteRegistry = { kind: 'deleteRegistry' } as const;
const domainBuilder = { kind: 'domainBuilder' } as const;
const clearanceCheck = { kind: 'clearanceCheck' } as const;
const stateGuard = { kind: 'stateGuard' } as const;
const importAssessment = { kind: 'importAssessment' } as const;
const historyCheck = { kind: 'historyCheck' } as const;
const collisionCheck = { kind: 'collisionCheck' } as const;
const unchecked = (issue: number) => ({ kind: 'unchecked', issue }) as const;

/**
 * Every acknowledgement and what reads it.
 *
 * Ordered as the vocabulary is, alphabetically, so a diff against
 * `ACKNOWLEDGEMENTS` reads straight down.
 */
export const ACKNOWLEDGEMENT_MECHANISMS: Record<Acknowledgement, AcknowledgementMechanism> = {
	acknowledgedActionDetach: deleteRegistry,
	acknowledgedActiveSubscriptionImpact: historyCheck,
	acknowledgedActualActionContextChange: stateGuard,
	// The one flag two mechanisms read, because two commands ask it. Deleting a
	// mission detaches the actual actions under its stops, which is the registry
	// counting rows; removing a single stop detaches nothing, so the guard in
	// `mission-acknowledgements.ts` asks the state instead. The registry is the
	// stronger of the two and names it.
	acknowledgedActualActionDetach: deleteRegistry,
	acknowledgedAssignmentItemDeletion: deleteRegistry,
	acknowledgedAssociatedRecordsDeletion: deleteRegistry,
	acknowledgedBatchClearance: clearanceCheck,
	acknowledgedBatchDeletion: deleteRegistry,
	acknowledgedCascadeDelete: deleteRegistry,
	acknowledgedClosedRequestChange: stateGuard,
	acknowledgedClosedRequestDeletion: stateGuard,
	acknowledgedCompletedItemAdditionalAction: unchecked(316),
	acknowledgedCompletedItemAdditionalRecord: clearanceCheck,
	acknowledgedCompletedMissionDeletion: stateGuard,
	// The registry blocks rather than cascades: a formulation with live
	// ingredient rows cannot be deleted at all, so the caller gets
	// `delete_blocked` naming them before this flag can be reached. That is the
	// catalog rule #123 settled — Delete means the record should never have
	// existed — and it is a stronger answer than a confirmation.
	acknowledgedComponentDeletion: deleteRegistry,
	acknowledgedContactMerge: domainBuilder,
	acknowledgedCrossDomainDetach: deleteRegistry,
	acknowledgedDeactivateEmptyFormulation: stateGuard,
	acknowledgedDependentDeactivation: clearanceCheck,
	acknowledgedDuplicateRequestedActionMissioning: stateGuard,
	acknowledgedDuplicateTrapCode: collisionCheck,
	acknowledgedEarlyStart: stateGuard,
	acknowledgedFutureOnlyChange: historyCheck,
	acknowledgedHabitatConfigurationSemanticsChange: domainBuilder,
	acknowledgedHabitatDelete: domainBuilder,
	acknowledgedHabitatLocationSemanticsChange: domainBuilder,
	acknowledgedHistoricalBatchLabelChange: historyCheck,
	acknowledgedHistoricalContactChange: historyCheck,
	acknowledgedHistoricalEquipmentLabelChange: historyCheck,
	acknowledgedHistoricalLabelChange: historyCheck,
	acknowledgedHistoricalLocationChange: historyCheck,
	acknowledgedHistoricalProductChange: historyCheck,
	acknowledgedHistoricalStationIdentityChange: historyCheck,
	acknowledgedHistoricalVehicleLabelChange: historyCheck,
	acknowledgedInProgressAssignmentChange: stateGuard,
	acknowledgedInProgressMissionChange: stateGuard,
	acknowledgedInspectionDetach: deleteRegistry,
	acknowledgedItemProgressDeletion: stateGuard,
	acknowledgedMergeConsolidatesHistory: domainBuilder,
	acknowledgedMethodMismatch: stateGuard,
	acknowledgedMissionDetach: deleteRegistry,
	acknowledgedMissionGeometryNotCovered: unchecked(316),
	acknowledgedMissionItemDeletion: deleteRegistry,
	acknowledgedNotificationDeletion: deleteRegistry,
	acknowledgedNotificationGeometryChange: stateGuard,
	acknowledgedNotificationPlanChange: stateGuard,
	acknowledgedNotificationRegenerationImpact: stateGuard,
	acknowledgedNotificationTimingChange: stateGuard,
	acknowledgedPartialImport: importAssessment,
	acknowledgedPartialWorkCancellation: stateGuard,
	acknowledgedPendingTrapCollection: stateGuard,
	acknowledgedProgressedItemLinkChange: stateGuard,
	acknowledgedProgressedItemReorder: stateGuard,
	acknowledgedProgressedMissionCancellation: stateGuard,
	acknowledgedRegionBoundaryChange: domainBuilder,
	acknowledgedRegionDelete: domainBuilder,
	acknowledgedRegionDetach: deleteRegistry,
	acknowledgedRequestedActionMismatch: unchecked(316),
	acknowledgedRouteItemDeletion: deleteRegistry,
	acknowledgedRouteRemoval: clearanceCheck,
	acknowledgedSpeciesCountDeletion: deleteRegistry,
	acknowledgedSpeciesCountsClearance: clearanceCheck,
	acknowledgedSummaryDeletion: clearanceCheck,
	acknowledgedSupportRecordDeletion: deleteRegistry,
	acknowledgedTargetMismatch: stateGuard,
	acknowledgedTaxonomyLabelChange: historyCheck,
	acknowledgedTaxonomyMeaningChange: historyCheck,
	acknowledgedTrapLocationSemanticsChange: domainBuilder,
	acknowledgedTrapMethodSemanticsChange: domainBuilder,
	acknowledgedUnitCodeChange: domainBuilder,
	acknowledgedUpdates: importAssessment,
	acknowledgedWorkedMissionPlanChange: stateGuard,
	acknowledgedWorkedMissionScheduleChange: stateGuard,
};

/**
 * How many acknowledgements nothing reads.
 *
 * Lower it when a branch guards one. `pnpm check:acknowledgements` fails when
 * this and the map disagree, so the number cannot rot in either direction.
 */
export const UNCHECKED_ACKNOWLEDGEMENTS = 3;

// ===========================================================================
// How an absent flag reads
// ===========================================================================

/**
 * The flags an absent value does not answer.
 *
 * Every other acknowledgement reads `!== false`: a client withholds one by
 * sending `false`, and absent means confirmed, which is what the endpoints did
 * before any of them was read. These four read `=== true` instead, and each has
 * a reason the default would be wrong:
 *
 * - `acknowledgedDuplicateTrapCode` asks about a collision the caller cannot
 *   have seen coming. Trap codes are indexed but not unique, so two traps may
 *   legitimately share one, and a collision the server finds while writing is a
 *   question rather than a rule. A body written before the collision existed
 *   cannot have answered it.
 * - the three mission flags guard a stop being completed over ground the
 *   mission does not cover, against an action it did not request, or on top of
 *   an action already recorded there. Each is a mismatch between what the crew
 *   did and what the plan said, and the crew is standing in front of it. The
 *   refusal is a 400 from the domain builder rather than the settled 409, which
 *   is why all three are still `unchecked(316)` in the map above.
 * - the two weather-import flags answer what the import's own assessment
 *   counted: how many stored summaries a spreadsheet would overwrite, and how
 *   many of its rows would fail. Neither number exists until the file has been
 *   read, so the first request cannot have answered them and the second one is
 *   what carries the answer.
 *
 * This list is the fork {@link acknowledged} used to hide. Before #426 the
 * default reader answered `!== false` and six call sites wrote `=== true` by
 * hand, so which posture a new command got was whichever reader its author
 * copied. Now the posture is data on the flag and the reader looks it up.
 *
 * A flag added to the vocabulary takes the default. That is the right way round:
 * the convention is what `docs/domain-command-contract.md` states, and the
 * exception is the thing that has to be argued for here.
 */
export const EXPLICIT_ACKNOWLEDGEMENTS = [
	'acknowledgedDuplicateTrapCode',
	'acknowledgedMissionGeometryNotCovered',
	'acknowledgedRequestedActionMismatch',
	'acknowledgedCompletedItemAdditionalAction',
	'acknowledgedUpdates',
	'acknowledgedPartialImport',
] as const satisfies readonly Acknowledgement[];

const EXPLICIT = new Set<string>(EXPLICIT_ACKNOWLEDGEMENTS);

/** Whether this flag is one an absent value does not answer. */
export function isExplicitAcknowledgement(flag: Acknowledgement): boolean {
	return EXPLICIT.has(flag);
}

// ===========================================================================
// The state refusal
// ===========================================================================

/**
 * The acknowledgements that turn on state rather than on a count.
 *
 * Not what hangs off it. "This request is closed", "this trap already has a
 * collection nobody has come back for" and "this stop names a different trap"
 * are facts about one row, so there is nothing to count and the sentence is the
 * whole answer.
 *
 * The mission ones are facts about a mission or a stop, and two of them read
 * past the row to answer: whether any work has been recorded against a
 * mission's stops, whether notifications have gone out for it. They are still
 * state, because the number is not the question. A mission worked once and a
 * mission worked forty times pose the caller the same decision, and listing
 * what would happen to those records is wrong anyway: nothing happens to them,
 * which is exactly the problem being pointed at.
 */
export type StateAcknowledgement =
	| 'acknowledgedActualActionContextChange'
	| 'acknowledgedActualActionDetach'
	| 'acknowledgedClosedRequestChange'
	| 'acknowledgedClosedRequestDeletion'
	| 'acknowledgedCompletedMissionDeletion'
	| 'acknowledgedDeactivateEmptyFormulation'
	| 'acknowledgedDuplicateRequestedActionMissioning'
	| 'acknowledgedEarlyStart'
	| 'acknowledgedInProgressAssignmentChange'
	| 'acknowledgedInProgressMissionChange'
	| 'acknowledgedItemProgressDeletion'
	| 'acknowledgedMethodMismatch'
	| 'acknowledgedNotificationGeometryChange'
	| 'acknowledgedNotificationPlanChange'
	| 'acknowledgedNotificationRegenerationImpact'
	| 'acknowledgedNotificationTimingChange'
	| 'acknowledgedPartialWorkCancellation'
	| 'acknowledgedPendingTrapCollection'
	| 'acknowledgedProgressedItemLinkChange'
	| 'acknowledgedProgressedItemReorder'
	| 'acknowledgedProgressedMissionCancellation'
	| 'acknowledgedTargetMismatch'
	| 'acknowledgedWorkedMissionPlanChange'
	| 'acknowledgedWorkedMissionScheduleChange';

/**
 * Thrown when a write against a record in a particular state withheld the
 * confirmation that state needs.
 *
 * Same `409 acknowledgement_required` as a delete or a clearance. It carries no
 * consequences at all, and `acknowledgementRequiredBody` turns that into an
 * empty list rather than a missing field: the client keys its wording off
 * `flag`, which it already has to do — two counted refusals under one code need
 * two different sentences — so one body shape serves all three and a form never
 * branches on whether the field is there. #315 followed this, and #316 will.
 */
export class StateAcknowledgementRequiredError extends Error {
	readonly acknowledgement: StateAcknowledgement;

	constructor(acknowledgement: StateAcknowledgement, message: string) {
		super(message);
		this.name = 'StateAcknowledgementRequiredError';
		this.acknowledgement = acknowledgement;
	}
}

/**
 * Refuse the write when the state holds and the confirmation was withheld.
 *
 * `message` is handed to the user, so it says what the state is rather than
 * naming the flag.
 *
 * @throws StateAcknowledgementRequiredError
 */
export function requireStateAcknowledgement(input: {
	readonly state: boolean;
	readonly acknowledgement: StateAcknowledgement;
	/** What the command carried. Anything but `true` is withheld. */
	readonly acknowledged: boolean;
	readonly message: string;
}): void {
	if (input.state && input.acknowledged !== true) {
		throw new StateAcknowledgementRequiredError(input.acknowledgement, input.message);
	}
}
