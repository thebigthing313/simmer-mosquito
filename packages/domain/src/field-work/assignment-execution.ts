import {
	createIssues,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	jsonObject as normalizeMetadata,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateNotFutureLocalDate,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue, JsonObject, LocalDateString } from '../shared.js';
import {
	type CollectedCollectionTiming,
	type ExactPendingCollectionTiming,
	type LarvalInspectionResultInput,
	type NormalizedLarvalInspectionResult,
	normalizeInspectionResult,
	validateCollectedTiming,
	validateOperationalDate,
} from '../surveillance-records.js';
import {
	basePayload,
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	normalizeOptionalTimestamp,
	validateBase,
} from './shared.js';

/**
 * Assignment execution: recording the work a stop was created for, and closing
 * the stop with it, in one command.
 *
 * An assignment item names a place the technician was sent. Until these
 * commands existed the record they produced there and the stop itself were two
 * unrelated writes, so a completed stop could not say what completed it and an
 * inspection could not say which stop produced it. These commands write both
 * halves in one transaction and store the link.
 *
 * They are `fieldWork.*` rather than `larvalSurveillance.*` or
 * `adultSurveillance.*` for the same reason the mission helpers are
 * `missionDispatch.*`: what makes them a unit is the assignment lifecycle, not
 * the record. Field validation is shared through `surveillance-records.ts` so
 * neither domain has to import the other, and so a rule only has one home.
 */

export interface AssignmentExecutionOptions {
	/** Complete the stop once the record is written. Defaults to true. */
	readonly completeAssignmentItem?: boolean;
	/** Start a not-yet-started assignment rather than refusing. Defaults to true. */
	readonly autoStartAssignment?: boolean;
	/** Required to add a second record to a stop that is already completed. */
	readonly acknowledgedCompletedItemAdditionalRecord?: boolean;
	/** Required when the record's target is not the stop's target. */
	readonly acknowledgedTargetMismatch?: boolean;
}

export type AssignmentExecutionPayload = {
	readonly completeAssignmentItem: boolean;
	readonly autoStartAssignment: boolean;
	readonly acknowledgedCompletedItemAdditionalRecord: boolean;
	readonly acknowledgedTargetMismatch: boolean;
};

export interface AssignmentExecutionInput
	extends FieldWorkCommandInput,
		AssignmentExecutionOptions {
	readonly assignmentItemId: DomainId;
	/**
	 * When the stop was handled. Defaults server-side when omitted; cannot be
	 * in the future beyond clock skew, and must be at or after the assignment's
	 * `startedAt` once the assignment is known to have started.
	 */
	readonly completedAt?: Date | null;
}

export type AssignmentExecutionCommandPayload = FieldWorkCommandPayload &
	AssignmentExecutionPayload & {
		readonly assignmentItemId: DomainId;
		readonly completedAt: Date | null;
	};

// --- Habitat stops: larval inspection ------------------------------------------

export interface RecordHabitatInspectionForAssignmentItemCommandInput
	extends AssignmentExecutionInput,
		LarvalInspectionResultInput {
	readonly inspectionId: DomainId;
	readonly inspectionDate: LocalDateString;
	readonly inspectedByProfileId?: DomainId | null;
	/**
	 * Optional override. Defaults server-side to the habitat the stop targets,
	 * which is the case that needs no acknowledgement.
	 */
	readonly habitatId?: DomainId | null;
}

export type RecordHabitatInspectionForAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.recordHabitatInspectionForAssignmentItem',
	AssignmentExecutionCommandPayload &
		NormalizedLarvalInspectionResult & {
			readonly inspectionId: DomainId;
			readonly inspectionDate: LocalDateString;
			readonly inspectedByProfileId: DomainId;
			readonly habitatId: DomainId | null;
		}
>;

export function recordHabitatInspectionForAssignmentItemCommand(
	input: RecordHabitatInspectionForAssignmentItemCommandInput,
): RecordHabitatInspectionForAssignmentItemCommand {
	const { issues, completedAt } = validateExecutionBase(input);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	validateNotFutureLocalDate(input.inspectionDate, 'inspectionDate', issues);
	normalizeOptionalUuid(input.inspectedByProfileId, 'inspectedByProfileId', issues);
	const habitatId = normalizeOptionalUuid(input.habitatId, 'habitatId', issues);
	const result = normalizeInspectionResult(input, 'result', issues);
	throwIfIssues('Record habitat inspection for assignment item command is invalid.', issues);

	return {
		type: 'fieldWork.recordHabitatInspectionForAssignmentItem',
		payload: {
			...executionPayload(input, completedAt),
			...result,
			inspectionId: normalizeRequiredId(input.inspectionId),
			inspectionDate: input.inspectionDate,
			inspectedByProfileId: normalizeActorDefaultProfileId(
				input.inspectedByProfileId,
				input.actorProfileId,
			),
			habitatId,
		},
	};
}

// --- Trap stops: setting a collection ------------------------------------------

export interface SetTrapCollectionForAssignmentItemCommandInput extends AssignmentExecutionInput {
	readonly collectionId: DomainId;
	readonly startedAt: Date;
	readonly setByProfileId?: DomainId | null;
	readonly collectionMethodId?: DomainId | null;
	readonly collectionLureId?: DomainId | null;
	readonly trapId?: DomainId | null;
	/** The org's custom fields for a collection, same as the ordinary trap set. */
	readonly metadata?: unknown | null;
}

export type SetTrapCollectionForAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.setTrapCollectionForAssignmentItem',
	AssignmentExecutionCommandPayload & {
		readonly collectionId: DomainId;
		readonly timing: ExactPendingCollectionTiming;
		readonly setByProfileId: DomainId;
		readonly collectionMethodId: DomainId | null;
		readonly collectionLureId: DomainId | null;
		readonly trapId: DomainId | null;
		readonly metadata: JsonObject | null;
	}
>;

export function setTrapCollectionForAssignmentItemCommand(
	input: SetTrapCollectionForAssignmentItemCommandInput,
): SetTrapCollectionForAssignmentItemCommand {
	const { issues, completedAt } = validateExecutionBase(input);
	requireUuid(input.collectionId, 'collectionId', issues);
	validateOperationalDate(input.startedAt, 'startedAt', issues);
	normalizeOptionalUuid(input.setByProfileId, 'setByProfileId', issues);
	const collectionMethodId = normalizeOptionalUuid(
		input.collectionMethodId,
		'collectionMethodId',
		issues,
	);
	const collectionLureId = normalizeOptionalUuid(
		input.collectionLureId,
		'collectionLureId',
		issues,
	);
	const trapId = normalizeOptionalUuid(input.trapId, 'trapId', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Set trap collection for assignment item command is invalid.', issues);

	return {
		type: 'fieldWork.setTrapCollectionForAssignmentItem',
		payload: {
			...executionPayload(input, completedAt),
			collectionId: normalizeRequiredId(input.collectionId),
			timing: { mode: 'exact_timestamps', startedAt: input.startedAt },
			setByProfileId: normalizeActorDefaultProfileId(input.setByProfileId, input.actorProfileId),
			collectionMethodId,
			collectionLureId,
			trapId,
			metadata,
		},
	};
}

// --- Trap stops: collecting a pending collection --------------------------------

export interface CollectTrapCollectionForAssignmentItemCommandInput
	extends AssignmentExecutionInput {
	readonly collectionId: DomainId;
	readonly collectedAtTimestamp: Date;
	readonly collectedByProfileId?: DomainId | null;
	readonly hasProblem?: boolean;
}

export type CollectTrapCollectionForAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.collectTrapCollectionForAssignmentItem',
	AssignmentExecutionCommandPayload & {
		readonly collectionId: DomainId;
		readonly collectedAtTimestamp: Date;
		readonly collectedByProfileId: DomainId;
		readonly hasProblem: boolean;
	}
>;

export function collectTrapCollectionForAssignmentItemCommand(
	input: CollectTrapCollectionForAssignmentItemCommandInput,
): CollectTrapCollectionForAssignmentItemCommand {
	const { issues, completedAt } = validateExecutionBase(input);
	requireUuid(input.collectionId, 'collectionId', issues);
	validateOperationalDate(input.collectedAtTimestamp, 'collectedAtTimestamp', issues);
	normalizeOptionalUuid(input.collectedByProfileId, 'collectedByProfileId', issues);
	throwIfIssues('Collect trap collection for assignment item command is invalid.', issues);

	return {
		type: 'fieldWork.collectTrapCollectionForAssignmentItem',
		payload: {
			...executionPayload(input, completedAt),
			collectionId: normalizeRequiredId(input.collectionId),
			collectedAtTimestamp: input.collectedAtTimestamp,
			collectedByProfileId: normalizeActorDefaultProfileId(
				input.collectedByProfileId,
				input.actorProfileId,
			),
			hasProblem: input.hasProblem ?? false,
		},
	};
}

// --- Trap stops: set and collect in one visit -----------------------------------

export interface RecordCollectedTrapCollectionForAssignmentItemCommandInput
	extends AssignmentExecutionInput {
	readonly collectionId: DomainId;
	readonly timing: CollectedCollectionTiming;
	readonly setByProfileId?: DomainId | null;
	readonly collectedByProfileId?: DomainId | null;
	readonly hasProblem?: boolean;
	readonly collectionMethodId?: DomainId | null;
	readonly collectionLureId?: DomainId | null;
	readonly trapId?: DomainId | null;
	/** The org's custom fields for a collection, same as the ordinary trap record. */
	readonly metadata?: unknown | null;
}

export type RecordCollectedTrapCollectionForAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.recordCollectedTrapCollectionForAssignmentItem',
	AssignmentExecutionCommandPayload & {
		readonly collectionId: DomainId;
		readonly timing: CollectedCollectionTiming;
		readonly setByProfileId: DomainId | null;
		readonly collectedByProfileId: DomainId;
		readonly hasProblem: boolean;
		readonly collectionMethodId: DomainId | null;
		readonly collectionLureId: DomainId | null;
		readonly trapId: DomainId | null;
		readonly metadata: JsonObject | null;
	}
>;

export function recordCollectedTrapCollectionForAssignmentItemCommand(
	input: RecordCollectedTrapCollectionForAssignmentItemCommandInput,
): RecordCollectedTrapCollectionForAssignmentItemCommand {
	const { issues, completedAt } = validateExecutionBase(input);
	requireUuid(input.collectionId, 'collectionId', issues);
	const timing = validateCollectedTiming(input.timing, 'timing', issues);
	const setByProfileId = normalizeOptionalUuid(input.setByProfileId, 'setByProfileId', issues);
	normalizeOptionalUuid(input.collectedByProfileId, 'collectedByProfileId', issues);
	const collectionMethodId = normalizeOptionalUuid(
		input.collectionMethodId,
		'collectionMethodId',
		issues,
	);
	const collectionLureId = normalizeOptionalUuid(
		input.collectionLureId,
		'collectionLureId',
		issues,
	);
	const trapId = normalizeOptionalUuid(input.trapId, 'trapId', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Record collected trap collection for assignment item command is invalid.', issues);

	return {
		type: 'fieldWork.recordCollectedTrapCollectionForAssignmentItem',
		payload: {
			...executionPayload(input, completedAt),
			collectionId: normalizeRequiredId(input.collectionId),
			timing,
			setByProfileId,
			collectedByProfileId: normalizeActorDefaultProfileId(
				input.collectedByProfileId,
				input.actorProfileId,
			),
			hasProblem: input.hasProblem ?? false,
			collectionMethodId,
			collectionLureId,
			trapId,
			metadata,
		},
	};
}

// --- Shared ---------------------------------------------------------------------

/**
 * Validation shared by every execution command, and the normalized
 * `completedAt` it produces. The timestamp is normalized once, here, so a
 * command cannot report the same bad clock reading twice.
 */
function validateExecutionBase(input: AssignmentExecutionInput): {
	readonly issues: DomainValidationIssue[];
	readonly completedAt: Date | null;
} {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.assignmentItemId, 'assignmentItemId', issues);
	const completedAt = normalizeOptionalTimestamp(input.completedAt, 'completedAt', issues, false);
	return { issues, completedAt };
}

function executionPayload(
	input: AssignmentExecutionInput,
	completedAt: Date | null,
): AssignmentExecutionCommandPayload {
	return {
		...basePayload(input),
		assignmentItemId: normalizeRequiredId(input.assignmentItemId),
		completedAt,
		completeAssignmentItem: input.completeAssignmentItem ?? true,
		autoStartAssignment: input.autoStartAssignment ?? true,
		acknowledgedCompletedItemAdditionalRecord:
			input.acknowledgedCompletedItemAdditionalRecord ?? false,
		acknowledgedTargetMismatch: input.acknowledgedTargetMismatch ?? false,
	};
}
