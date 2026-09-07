import {
	applyRecordDeletion,
	assertClearanceAcknowledged,
	assertWriteReferences,
	type ClearanceRule,
	checkedValues,
	type DeleteAcknowledgements,
	sql,
} from '@simmer-mosquito/db';
import type {
	AdultSurveillanceCommand,
	CollectionTiming,
	CollectTrapCollectionForAssignmentItemCommand,
	RecordCollectedTrapCollectionForAssignmentItemCommand,
	SetTrapCollectionForAssignmentItemCommand,
} from '@simmer-mosquito/domain';
import { requireStateAcknowledgement } from '../../acknowledgements.js';
import { CommandError } from '../../command-endpoint.js';
import { returnColumns } from '../../return-columns.js';
import { beginExecution, completeExecutedStop } from '../field-work/assignment-lifecycle.js';
import {
	type AdultSurveillanceTransaction,
	type CollectionInsertInput,
	type CollectionRow,
	type CollectionTimingColumns,
	type CollectionUpdateColumns,
	geojsonToGeom,
	loadTrapSnapshot,
	localDateColumn,
	resolveLocationGeom,
	surveillanceCatalogReferences,
} from './shared.js';

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * The fifteen collection commands, in one writer.
 *
 * `table-commands/collections.ts` is the only caller: it builds the command a
 * `/commands/collections` body names and hands it here.
 */
export async function writeCollectionCommand(
	trx: AdultSurveillanceTransaction,
	command: CollectionCommand,
): Promise<CollectionRow | null> {
	switch (command.type) {
		case 'adultSurveillance.setTrapCollection': {
			const snapshot = await loadTrapSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.trapId,
			);
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: geojsonToGeom(snapshot.geojson),
				trapId: command.payload.trapId,
				collectionMethodId: snapshot.collectionMethodId,
				collectionLureId: snapshot.collectionLureId,
				addressId: snapshot.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: null,
				hasProblem: false,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		}
		case 'fieldWork.setTrapCollectionForAssignmentItem':
			return setTrapCollectionForStop(trx, command.payload);
		case 'fieldWork.recordCollectedTrapCollectionForAssignmentItem':
			return recordCollectedTrapCollectionForStop(trx, command.payload);
		case 'fieldWork.collectTrapCollectionForAssignmentItem':
			return collectTrapCollectionForStop(trx, command.payload);
		case 'adultSurveillance.recordCollectedTrapCollection': {
			await assertNoPendingTrapCollection(
				trx,
				command.payload.organizationId,
				command.payload.trapId,
				command.payload.acknowledgedPendingTrapCollection,
			);
			const snapshot = await loadTrapSnapshot(
				trx,
				command.payload.organizationId,
				command.payload.trapId,
			);
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: geojsonToGeom(snapshot.geojson),
				trapId: command.payload.trapId,
				collectionMethodId: snapshot.collectionMethodId,
				collectionLureId: snapshot.collectionLureId,
				addressId: snapshot.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: command.payload.collectedByProfileId,
				hasProblem: command.payload.hasProblem,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		}
		case 'adultSurveillance.setAdHocCollection':
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: await resolveLocationGeom(
					trx,
					command.payload.organizationId,
					command.payload.locationSource,
				),
				trapId: null,
				collectionMethodId: command.payload.collectionMethodId,
				collectionLureId: command.payload.collectionLureId,
				addressId: command.payload.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: null,
				hasProblem: false,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'adultSurveillance.recordCollectedAdHocCollection':
			return insertCollection(trx, {
				id: command.payload.collectionId,
				organizationId: command.payload.organizationId,
				geom: await resolveLocationGeom(
					trx,
					command.payload.organizationId,
					command.payload.locationSource,
				),
				trapId: null,
				collectionMethodId: command.payload.collectionMethodId,
				collectionLureId: command.payload.collectionLureId,
				addressId: command.payload.addressId,
				timing: command.payload.timing,
				setByProfileId: command.payload.setByProfileId,
				collectedByProfileId: command.payload.collectedByProfileId,
				hasProblem: command.payload.hasProblem,
				metadata: command.payload.metadata,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'adultSurveillance.collectCollection':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				collected_at: command.payload.collectedAt,
				collected_by_profile_id: command.payload.collectedByProfileId,
				has_problem: command.payload.hasProblem,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.cancelPendingCollection':
			return softDeleteCollection(
				trx,
				command.payload.collectionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				// A pending collection has not been collected, so it has no species
				// counts to confirm the loss of, and the command carries no flag that
				// could confirm one. Withholding here would refuse a cancel no client
				// could ever complete.
				{ acknowledgedSpeciesCountDeletion: true },
			);
		case 'adultSurveillance.updateCollectionFieldDetails':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				...(command.payload.changes.timing !== undefined
					? timingColumns(command.payload.changes.timing)
					: {}),
				...('setByProfileId' in command.payload.changes
					? { set_by_profile_id: command.payload.changes.setByProfileId ?? null }
					: {}),
				...('collectedByProfileId' in command.payload.changes
					? { collected_by_profile_id: command.payload.changes.collectedByProfileId ?? null }
					: {}),
				...('hasProblem' in command.payload.changes
					? { has_problem: command.payload.changes.hasProblem ?? false }
					: {}),
				...('metadata' in command.payload.changes
					? { metadata: command.payload.changes.metadata ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.updateAdHocCollectionConfiguration':
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'collections', recordId: command.payload.collectionId },
				references: surveillanceCatalogReferences(command.payload.changes),
			});
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				...(command.payload.changes.locationSource !== undefined
					? {
							geom: await resolveLocationGeom(
								trx,
								command.payload.organizationId,
								command.payload.changes.locationSource,
							),
						}
					: {}),
				...('collectionMethodId' in command.payload.changes
					? { collection_method_id: command.payload.changes.collectionMethodId }
					: {}),
				...('collectionLureId' in command.payload.changes
					? { collection_lure_id: command.payload.changes.collectionLureId ?? null }
					: {}),
				...('addressId' in command.payload.changes
					? { address_id: command.payload.changes.addressId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.deleteCollection':
			return softDeleteCollection(
				trx,
				command.payload.collectionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				{ acknowledgedSpeciesCountDeletion: command.payload.acknowledgedSpeciesCountDeletion },
			);
		case 'adultSurveillance.markCollectionZeroResult': {
			// Zero result means nothing was caught, so the counts already recorded
			// against the collection are being said to be wrong. They go, and the
			// organization is told how many. A collection with none is marked without
			// a question.
			await assertClearanceAcknowledged(trx, {
				acknowledgement: 'acknowledgedSpeciesCountsClearance',
				acknowledged: command.payload.acknowledgedSpeciesCountsClearance,
				rules: [
					{
						key: 'collectionSpeciesCounts',
						table: 'collection_species',
						singular: 'species count',
						plural: 'species counts',
						match: sql`collection_id = ${command.payload.collectionId}
						and organization_id = ${command.payload.organizationId}
						and deleted_at is null`,
					},
				],
			});
			await trx
				.updateTable('collection_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('collection_id', '=', command.payload.collectionId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.execute();
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				is_zero_result: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'adultSurveillance.clearCollectionZeroResult':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				is_zero_result: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'adultSurveillance.setCollectionBycatch':
			return updateCollection(trx, command.payload.collectionId, command.payload.organizationId, {
				has_bycatch: command.payload.hasBycatch,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		default:
			throw new Error(`Unsupported collection command: ${command.type}`);
	}
}

/**
 * The three trap-stop execution commands, which write a collection *and* close
 * the stop that produced it. They are `fieldWork.*` commands handled here
 * because the row is a collection; see the same note in the inspection handler.
 */
export type CollectionCommand =
	| AdultSurveillanceCommand
	| SetTrapCollectionForAssignmentItemCommand
	| CollectTrapCollectionForAssignmentItemCommand
	| RecordCollectedTrapCollectionForAssignmentItemCommand;

type ExecutionPayload = (
	| SetTrapCollectionForAssignmentItemCommand
	| CollectTrapCollectionForAssignmentItemCommand
	| RecordCollectedTrapCollectionForAssignmentItemCommand
)['payload'];

function executionOptions(payload: ExecutionPayload) {
	return {
		autoStart: payload.autoStartAssignment,
		acknowledgedCompletedItemAdditionalRecord: payload.acknowledgedCompletedItemAdditionalRecord,
		acknowledgedTargetMismatch: payload.acknowledgedTargetMismatch,
		recordedHere: collectionsRecordedAtStop(payload.assignmentItemId, payload.organizationId),
		completeItem: payload.completeAssignmentItem,
		completedAt: payload.completedAt,
	};
}

/**
 * The collections already filed against a stop, for the double-submit refusal
 * to count.
 *
 * Both provenance columns, because one visit can set a trap and another can
 * empty it, and a stop that did either is a stop this record would be the
 * second of.
 */
function collectionsRecordedAtStop(
	assignmentItemId: string,
	organizationId: string,
): ClearanceRule {
	return {
		key: 'stopCollections',
		table: 'collections',
		singular: 'collection',
		plural: 'collections',
		match: sql`(set_assignment_item_id = ${assignmentItemId}::uuid
			or collected_assignment_item_id = ${assignmentItemId}::uuid)
			and organization_id = ${organizationId}::uuid
			and deleted_at is null`,
	};
}

/**
 * Refuse a collected record for a trap that still has a collection nobody came
 * back for.
 *
 * A pending collection is one that was set and never collected. Recording a
 * collected one alongside it usually means the field crew is recording the
 * visit that closed the pending row, on a new record, and the pending row will
 * sit open forever. It is a fact about the trap rather than about anything
 * hanging off this collection, so nothing is counted and the sentence is the
 * whole answer.
 */
async function assertNoPendingTrapCollection(
	trx: AdultSurveillanceTransaction,
	organizationId: string,
	trapId: string,
	acknowledgedPendingTrapCollection: boolean,
): Promise<void> {
	if (acknowledgedPendingTrapCollection === true) {
		return;
	}
	const pending = await trx
		.selectFrom('collections')
		.select('id')
		.where('organization_id', '=', organizationId)
		.where('trap_id', '=', trapId)
		.where('collected_at', 'is', null)
		.where('deleted_at', 'is', null)
		.limit(1)
		.executeTakeFirst();
	requireStateAcknowledgement({
		state: pending !== undefined,
		acknowledgement: 'acknowledgedPendingTrapCollection',
		acknowledged: acknowledgedPendingTrapCollection,
		message: 'This trap already has a collection that was set and never collected.',
	});
}

async function finishExecution(
	trx: AdultSurveillanceTransaction,
	payload: ExecutionPayload,
): Promise<void> {
	if (payload.completeAssignmentItem) {
		await completeExecutedStop(
			trx,
			payload.assignmentItemId,
			payload.organizationId,
			payload.actorProfileId,
			payload.completedAt,
		);
	}
}

async function setTrapCollectionForStop(
	trx: AdultSurveillanceTransaction,
	payload: SetTrapCollectionForAssignmentItemCommand['payload'],
): Promise<CollectionRow | null> {
	const stop = await beginExecution(
		trx,
		payload.assignmentItemId,
		payload.organizationId,
		payload.actorProfileId,
		{ entityType: 'trap', entityId: payload.trapId },
		executionOptions(payload),
	);
	const trapId = payload.trapId ?? stop.entityId;
	const snapshot = await loadTrapSnapshot(trx, payload.organizationId, trapId);
	const collection = await insertCollection(trx, {
		id: payload.collectionId,
		organizationId: payload.organizationId,
		geom: geojsonToGeom(snapshot.geojson),
		trapId,
		collectionMethodId: payload.collectionMethodId ?? snapshot.collectionMethodId,
		collectionLureId: payload.collectionLureId ?? snapshot.collectionLureId,
		addressId: snapshot.addressId,
		timing: payload.timing,
		setByProfileId: payload.setByProfileId,
		collectedByProfileId: null,
		hasProblem: false,
		metadata: payload.metadata,
		actorProfileId: payload.actorProfileId,
		setAssignmentItemId: payload.assignmentItemId,
	});
	await finishExecution(trx, payload);
	return collection;
}

async function recordCollectedTrapCollectionForStop(
	trx: AdultSurveillanceTransaction,
	payload: RecordCollectedTrapCollectionForAssignmentItemCommand['payload'],
): Promise<CollectionRow | null> {
	const stop = await beginExecution(
		trx,
		payload.assignmentItemId,
		payload.organizationId,
		payload.actorProfileId,
		{ entityType: 'trap', entityId: payload.trapId },
		executionOptions(payload),
	);
	const trapId = payload.trapId ?? stop.entityId;
	const snapshot = await loadTrapSnapshot(trx, payload.organizationId, trapId);
	// One visit that both set and emptied the trap, so the same stop is the
	// provenance for both halves.
	const collection = await insertCollection(trx, {
		id: payload.collectionId,
		organizationId: payload.organizationId,
		geom: geojsonToGeom(snapshot.geojson),
		trapId,
		collectionMethodId: payload.collectionMethodId ?? snapshot.collectionMethodId,
		collectionLureId: payload.collectionLureId ?? snapshot.collectionLureId,
		addressId: snapshot.addressId,
		timing: payload.timing,
		setByProfileId: payload.setByProfileId,
		collectedByProfileId: payload.collectedByProfileId,
		hasProblem: payload.hasProblem,
		metadata: payload.metadata,
		actorProfileId: payload.actorProfileId,
		setAssignmentItemId: payload.assignmentItemId,
		collectedAssignmentItemId: payload.assignmentItemId,
	});
	await finishExecution(trx, payload);
	return collection;
}

async function collectTrapCollectionForStop(
	trx: AdultSurveillanceTransaction,
	payload: CollectTrapCollectionForAssignmentItemCommand['payload'],
): Promise<CollectionRow | null> {
	// The collection already exists — it was set on an earlier visit — so the
	// target check is against the trap that row already names, not a snapshot.
	const existing = await trx
		.selectFrom('collections')
		.select(['trap_id'])
		.where('id', '=', payload.collectionId)
		.where('organization_id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (existing === undefined) {
		throw new CommandError(404, { error: 'collection_not_found' });
	}
	await beginExecution(
		trx,
		payload.assignmentItemId,
		payload.organizationId,
		payload.actorProfileId,
		{ entityType: 'trap', entityId: existing.trap_id },
		executionOptions(payload),
	);
	const collection = await updateCollection(trx, payload.collectionId, payload.organizationId, {
		collected_at: payload.collectedAtTimestamp,
		collected_by_profile_id: payload.collectedByProfileId,
		has_problem: payload.hasProblem,
		collected_assignment_item_id: payload.assignmentItemId,
		updated_by_profile_id: payload.actorProfileId,
	});
	await finishExecution(trx, payload);
	return collection;
}

async function insertCollection(
	trx: AdultSurveillanceTransaction,
	input: CollectionInsertInput,
): Promise<CollectionRow> {
	// The one funnel both create paths run through, so the gate sits here rather
	// than on each caller.
	await assertWriteReferences(trx, {
		organizationId: input.organizationId,
		write: { kind: 'create' },
		references: surveillanceCatalogReferences(input),
	});

	const row = await trx
		.insertInto('collections')
		.values(
			await checkedValues(trx, input.organizationId, {
				id: input.id,
				organization_id: input.organizationId,
				geom: input.geom,
				trap_id: input.trapId,
				collection_method_id: input.collectionMethodId,
				collection_lure_id: input.collectionLureId,
				address_id: input.addressId,
				collected_by_profile_id: input.collectedByProfileId,
				set_by_profile_id: input.setByProfileId,
				has_problem: input.hasProblem,
				metadata: input.metadata,
				set_assignment_item_id: input.setAssignmentItemId ?? null,
				collected_assignment_item_id: input.collectedAssignmentItemId ?? null,
				created_by_profile_id: input.actorProfileId,
				updated_by_profile_id: input.actorProfileId,
				...timingColumns(input.timing),
			}),
		)
		.returning(returnColumns.collections)
		.executeTakeFirstOrThrow();
	return row;
}

async function updateCollection(
	trx: AdultSurveillanceTransaction,
	collectionId: string,
	organizationId: string,
	set: CollectionUpdateColumns,
): Promise<CollectionRow | null> {
	const row = await trx
		.updateTable('collections')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', collectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns.collections)
		.executeTakeFirst();
	return row ?? null;
}

/**
 * Cancelling a pending collection and deleting a collected one both retire the
 * row, so both carry the same consequences for the species counts, comments,
 * and helpers hanging off it — and both leave the control work that cited the
 * collection standing, with its link cleared.
 */
async function softDeleteCollection(
	trx: AdultSurveillanceTransaction,
	collectionId: string,
	organizationId: string,
	actorProfileId: string,
	acknowledged: DeleteAcknowledgements,
): Promise<CollectionRow | null> {
	await applyRecordDeletion(trx, {
		recordType: 'collection',
		recordId: collectionId,
		organizationId,
		actorProfileId,
		acknowledged,
	});
	const row = await trx
		.updateTable('collections')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns.collections)
		.executeTakeFirst();
	return row ?? null;
}

function timingColumns(timing: CollectionTiming): CollectionTimingColumns {
	if (timing.mode === 'collection_date_duration') {
		return {
			collection_timing_mode: 'collection_date_duration',
			started_at: null,
			collected_at: null,
			collection_date: localDateColumn(timing.collectionDate),
			duration_amount: timing.durationAmount,
			duration_unit_id: timing.durationUnitId,
		};
	}
	return {
		collection_timing_mode: 'exact_timestamps',
		started_at: timing.startedAt,
		collected_at: 'collectedAt' in timing ? timing.collectedAt : null,
		collection_date: null,
		duration_amount: null,
		duration_unit_id: null,
	};
}
