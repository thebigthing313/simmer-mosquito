/**
 * The `collections` table, as commands.
 *
 * The largest map so far — fifteen commands, and the one where inference was
 * doing the most work. `buildCollectionCreateCommand` was a three-way nested
 * decision over a POST body: an `assignmentItemId` chose the stop-execution
 * pair, a `trapId` chose the trap pair, neither chose the ad hoc pair, and
 * *inside* each pair a `collectedAt` that happened to parse chose between
 * setting the trap and recording it already emptied. Six commands, none of them
 * named, all of them reconstructed from which keys arrived — and a set that was
 * meant to be pending became a completed record if a stray `collectedAt` rode
 * along.
 *
 * The old surface also needed two extra routes, `/{id}/collect` and
 * `/{id}/cancel`, because a PATCH body could not say which of them it meant.
 * Both are ordinary entries here: a client names `collectCollection` on the
 * PATCH and `cancelPendingCollection` on the DELETE.
 *
 * ## Field names
 *
 * Postgres column names throughout — `trap_id`, `collection_method_id`,
 * `started_at`, `collected_at`, `collection_timing_mode`, `has_problem`,
 * `has_bycatch`. Three keys stay camelCase because they name no column:
 * `locationSource` (geometry never syncs), `completedAt` (when the stop closed,
 * not anything stored here), and `assignmentItemId`.
 *
 * That last one is worth spelling out, because `inspections` spells it
 * `assignment_item_id` — and that is the rule rather than an exception to it. A
 * key is a column name when there is a column by that name. Inspections have
 * one; collections have *two*, `set_assignment_item_id` and
 * `collected_assignment_item_id`, because setting a trap and emptying it are
 * separate visits on separate days. A caller names the stop, and which of the
 * two columns it lands in is the command's answer, not the caller's.
 */

import {
	type AdultCollectionLocationSourceInput,
	type CollectedCollectionTiming,
	type CollectionTiming,
	cancelPendingCollectionCommand,
	clearCollectionZeroResultCommand,
	collectCollectionCommand,
	collectTrapCollectionForAssignmentItemCommand,
	deleteCollectionCommand,
	markCollectionZeroResultCommand,
	recordCollectedAdHocCollectionCommand,
	recordCollectedTrapCollectionCommand,
	recordCollectedTrapCollectionForAssignmentItemCommand,
	setAdHocCollectionCommand,
	setCollectionBycatchCommand,
	setTrapCollectionCommand,
	setTrapCollectionForAssignmentItemCommand,
	updateAdHocCollectionConfigurationCommand,
	updateCollectionFieldDetailsCommand,
} from '@simmer-mosquito/domain';
import {
	type CollectionCommand,
	writeCollectionCommand,
} from '../adult-surveillance-commands/collections.js';
import { type CollectionRow, pendingStartedAt } from '../adult-surveillance-commands/shared.js';
import {
	type CommandPayload,
	readExecutionOptions,
	readNullableText,
	readNumber,
	readText,
} from '../command-payload.js';
import { type CommandDb, readDate } from '../command-write.js';
import type { IntentRequest, TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The keys a collection write reads that are not its columns: where the trap
 * was, and the assignment stop a set or pull closes.
 */
type CollectionArgument = 'locationSource' | 'assignmentItemId' | 'completedAt';

/** The body of a write to this module's table. */
type CollectionPayload = CommandPayload<'collections', CollectionArgument>;

/**
 * How long the trap was out, read from the six columns that record it.
 *
 * Two shapes, because agencies record this two ways and the setting says which —
 * exact timestamps, or a collection date with a duration. See the
 * `adult-collection-timing-modes` note: reading one agency's collections under
 * the other's mode empties a surface without erroring.
 *
 * `collected_at` is what separates a pending collection from a collected one,
 * and it is the one place `readDate`'s null return is load-bearing rather than
 * cosmetic — the timing carries the field or it does not.
 */
function collectionTiming(payload: CollectionPayload): CollectionTiming {
	if (payload.collection_timing_mode === 'collection_date_duration') {
		return {
			mode: 'collection_date_duration',
			collectionDate: readText(payload.collection_date) ?? '',
			durationAmount: readNumber(payload.duration_amount) ?? Number.NaN,
			durationUnitId: readText(payload.duration_unit_id) ?? '',
		};
	}
	const startedAt = readDate(payload.started_at) ?? new Date(Number.NaN);
	const collectedAt = readDate(payload.collected_at);
	if (collectedAt !== null) {
		return { mode: 'exact_timestamps', startedAt, collectedAt };
	}
	return { mode: 'exact_timestamps', startedAt };
}

/**
 * The same reading, where the command already said the trap has been emptied.
 *
 * The cast is what it was before, but its justification changed: the old route
 * had to compute `isCollectedTiming(timing)` and then trust its own answer.
 * Here the name is the claim, and the domain's `validateCollectedTiming` is
 * what settles it.
 */
function collectedTiming(payload: CollectionPayload): CollectedCollectionTiming {
	return collectionTiming(payload) as CollectedCollectionTiming;
}

function hasTimingColumns(payload: CollectionPayload): boolean {
	return (
		payload.collection_timing_mode !== undefined ||
		payload.started_at !== undefined ||
		payload.collected_at !== undefined ||
		payload.collection_date !== undefined ||
		payload.duration_amount !== undefined ||
		payload.duration_unit_id !== undefined
	);
}

/**
 * What the three stop-execution commands share.
 *
 * They close an assignment stop in the same transaction that writes the
 * collection, so the work can never exist with the stop still pending.
 */
function stopExecution({
	payload,
	organization,
	id,
}: IntentRequest<'collections', CollectionArgument>) {
	return {
		...organization,
		collectionId: id,
		assignmentItemId: readText(payload.assignmentItemId) ?? '',
		completedAt: readDate(payload.completedAt),
		...readExecutionOptions(payload),
	};
}

/** The trap defaults a stop-set may override, which otherwise come from the trap. */
function trapOverrides(payload: CollectionPayload) {
	return {
		// Nullable rather than absent: the stop already names a trap, so the
		// ordinary call sends none and cannot disagree with it, and the writer falls
		// back to the trap's own method and lure.
		trapId: readNullableText(payload.trap_id),
		collectionMethodId: readNullableText(payload.collection_method_id),
		collectionLureId: readNullableText(payload.collection_lure_id),
		metadata: payload.metadata ?? null,
	};
}

export function collectionTableCommands(
	db: CommandDb,
): TableCommands<'collections', CollectionCommand, CollectionRow, CollectionArgument> {
	return {
		table: 'collections',
		run: { db, write: writeCollectionCommand, notFound: 'collection_not_found', key: 'collection' },
		intents: {
			// --- Setting a trap ------------------------------------------------
			'adultSurveillance.setTrapCollection': ({ payload, organization, id }) =>
				setTrapCollectionCommand({
					...organization,
					collectionId: id,
					trapId: readText(payload.trap_id) ?? '',
					startedAt: pendingStartedAt(collectionTiming(payload)),
					setByProfileId: readNullableText(payload.set_by_profile_id),
					metadata: payload.metadata ?? null,
				}),

			'adultSurveillance.setAdHocCollection': ({ payload, organization, id }) =>
				setAdHocCollectionCommand({
					...organization,
					collectionId: id,
					collectionMethodId: readText(payload.collection_method_id) ?? '',
					locationSource: payload.locationSource as AdultCollectionLocationSourceInput,
					collectionLureId: readNullableText(payload.collection_lure_id),
					addressId: readNullableText(payload.address_id),
					startedAt: pendingStartedAt(collectionTiming(payload)),
					setByProfileId: readNullableText(payload.set_by_profile_id),
					metadata: payload.metadata ?? null,
				}),

			// --- Recording one already emptied ----------------------------------
			'adultSurveillance.recordCollectedTrapCollection': ({ payload, organization, id }) =>
				recordCollectedTrapCollectionCommand({
					...organization,
					collectionId: id,
					trapId: readText(payload.trap_id) ?? '',
					timing: collectedTiming(payload),
					setByProfileId: readNullableText(payload.set_by_profile_id),
					collectedByProfileId: readNullableText(payload.collected_by_profile_id),
					hasProblem: payload.has_problem === true,
					acknowledgedPendingTrapCollection: acknowledged(
						payload,
						'acknowledgedPendingTrapCollection',
					),
					metadata: payload.metadata ?? null,
				}),

			'adultSurveillance.recordCollectedAdHocCollection': ({ payload, organization, id }) =>
				recordCollectedAdHocCollectionCommand({
					...organization,
					collectionId: id,
					collectionMethodId: readText(payload.collection_method_id) ?? '',
					locationSource: payload.locationSource as AdultCollectionLocationSourceInput,
					collectionLureId: readNullableText(payload.collection_lure_id),
					addressId: readNullableText(payload.address_id),
					timing: collectedTiming(payload),
					setByProfileId: readNullableText(payload.set_by_profile_id),
					collectedByProfileId: readNullableText(payload.collected_by_profile_id),
					hasProblem: payload.has_problem === true,
					metadata: payload.metadata ?? null,
				}),

			// --- The same three, off an assignment stop -------------------------
			'fieldWork.setTrapCollectionForAssignmentItem': (request) =>
				setTrapCollectionForAssignmentItemCommand({
					...stopExecution(request),
					...trapOverrides(request.payload),
					startedAt: pendingStartedAt(collectionTiming(request.payload)),
					setByProfileId: readNullableText(request.payload.set_by_profile_id),
				}),

			'fieldWork.recordCollectedTrapCollectionForAssignmentItem': (request) =>
				recordCollectedTrapCollectionForAssignmentItemCommand({
					...stopExecution(request),
					...trapOverrides(request.payload),
					timing: collectedTiming(request.payload),
					setByProfileId: readNullableText(request.payload.set_by_profile_id),
					collectedByProfileId: readNullableText(request.payload.collected_by_profile_id),
					hasProblem: request.payload.has_problem === true,
				}),

			// The collection already exists — it was set on an earlier visit — so this
			// takes no trap and no timing, only when it was emptied.
			'fieldWork.collectTrapCollectionForAssignmentItem': (request) =>
				collectTrapCollectionForAssignmentItemCommand({
					...stopExecution(request),
					collectedAtTimestamp: readDate(request.payload.collected_at) ?? new Date(Number.NaN),
					collectedByProfileId: readNullableText(request.payload.collected_by_profile_id),
					hasProblem: request.payload.has_problem === true,
				}),

			// --- Emptying, cancelling, correcting -------------------------------
			'adultSurveillance.collectCollection': ({ payload, organization, id }) =>
				collectCollectionCommand({
					...organization,
					collectionId: id,
					collectedAt: readDate(payload.collected_at) ?? new Date(Number.NaN),
					collectedByProfileId: readNullableText(payload.collected_by_profile_id),
					hasProblem: payload.has_problem === true,
					metadata: payload.metadata ?? null,
				}),

			'adultSurveillance.cancelPendingCollection': ({ organization, id }) =>
				cancelPendingCollectionCommand({ ...organization, collectionId: id }),

			'adultSurveillance.updateCollectionFieldDetails': ({ payload, organization, id }) =>
				updateCollectionFieldDetailsCommand({
					...organization,
					collectionId: id,
					// The six timing columns move as one — a collection is either exactly
					// timestamped or dated with a duration, and half of each is not a state
					// the row can hold. So they are read together or not at all.
					...(hasTimingColumns(payload) ? { timing: collectionTiming(payload) } : {}),
					...(payload.set_by_profile_id !== undefined
						? { setByProfileId: readNullableText(payload.set_by_profile_id) }
						: {}),
					...(payload.collected_by_profile_id !== undefined
						? { collectedByProfileId: readNullableText(payload.collected_by_profile_id) }
						: {}),
					...(payload.has_problem !== undefined
						? { hasProblem: payload.has_problem === true }
						: {}),
					...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
				}),

			'adultSurveillance.updateAdHocCollectionConfiguration': ({ payload, organization, id }) =>
				updateAdHocCollectionConfigurationCommand({
					...organization,
					collectionId: id,
					...(payload.collection_method_id !== undefined
						? { collectionMethodId: readText(payload.collection_method_id) ?? '' }
						: {}),
					...(payload.locationSource !== undefined
						? { locationSource: payload.locationSource as AdultCollectionLocationSourceInput }
						: {}),
					...(payload.collection_lure_id !== undefined
						? { collectionLureId: readNullableText(payload.collection_lure_id) }
						: {}),
					...(payload.address_id !== undefined
						? { addressId: readNullableText(payload.address_id) }
						: {}),
				}),

			// --- The result ------------------------------------------------------
			// `is_zero_result` is not a field to set: marking one clears every species
			// count on the collection, and clearing it does not put them back. Two
			// names rather than a boolean read for its direction.
			'adultSurveillance.markCollectionZeroResult': ({ payload, organization, id }) =>
				markCollectionZeroResultCommand({
					...organization,
					collectionId: id,
					acknowledgedSpeciesCountsClearance: acknowledged(
						payload,
						'acknowledgedSpeciesCountsClearance',
					),
				}),

			'adultSurveillance.clearCollectionZeroResult': ({ organization, id }) =>
				clearCollectionZeroResultCommand({ ...organization, collectionId: id }),

			// Bycatch is an observation rather than a state transition, so unlike the
			// pair above the value is the point.
			'adultSurveillance.setCollectionBycatch': ({ payload, organization, id }) =>
				setCollectionBycatchCommand({
					...organization,
					collectionId: id,
					hasBycatch: payload.has_bycatch === true,
				}),

			'adultSurveillance.deleteCollection': ({ payload, organization, id }) =>
				deleteCollectionCommand({
					...organization,
					collectionId: id,
					acknowledgedSpeciesCountDeletion: acknowledged(
						payload,
						'acknowledgedSpeciesCountDeletion',
					),
				}),
		},
	};
}
