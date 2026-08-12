import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
import {
	type AdultCollectionLocationSourceInput,
	type AdultSurveillanceCommand,
	type CollectedCollectionTiming,
	type CollectionTiming,
	type CollectTrapCollectionForAssignmentItemCommand,
	cancelPendingCollectionCommand,
	clearCollectionZeroResultCommand,
	collectCollectionCommand,
	collectTrapCollectionForAssignmentItemCommand,
	deleteCollectionCommand,
	markCollectionZeroResultCommand,
	type RecordCollectedTrapCollectionForAssignmentItemCommand,
	recordCollectedAdHocCollectionCommand,
	recordCollectedTrapCollectionCommand,
	recordCollectedTrapCollectionForAssignmentItemCommand,
	type SetTrapCollectionForAssignmentItemCommand,
	setAdHocCollectionCommand,
	setCollectionBycatchCommand,
	setTrapCollectionCommand,
	setTrapCollectionForAssignmentItemCommand,
	updateAdHocCollectionConfigurationCommand,
	updateCollectionFieldDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { CommandError } from '../command-endpoint.js';
import { readExecutionOptions, readNullableText, readText } from '../command-payload.js';
import {
	beginExecution,
	completeExecutedStop,
} from '../field-work-commands/assignment-lifecycle.js';
import {
	type AdultSurveillanceDb,
	type AdultSurveillanceTransaction,
	agencyCommandContext,
	type CollectionInsertInput,
	type CollectionTimingColumns,
	type CollectionUpdateColumns,
	type CommandContext,
	collectionReturnColumns,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	hasTimingFields,
	type InvalidCommandBody,
	invalidUpdate,
	isCollectedTiming,
	loadTrapSnapshot,
	localDateColumn,
	pendingStartedAt,
	readCollectionTiming,
	readDate,
	resolveLocationGeom,
	runCommands,
	type SafeCollection,
	toSafeCollection,
} from './shared.js';

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export function registerCollectionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/adult-surveillance/collections',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext }) => buildCollectionCreateCommand(authContext, payload),
			run: (context, commands) => runCollectionCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/adult-surveillance/collections/:collectionId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildCollectionUpdateCommands(authContext, param('collectionId'), payload),
			run: (context, commands) => runCollectionCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/adult-surveillance/collections/:collectionId/collect',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) => {
				const assignmentItemId = readNullableText(payload.assignmentItemId);
				// Emptying the trap off the stop that sent the technician to it.
				if (assignmentItemId !== null) {
					return collectTrapCollectionForAssignmentItemCommand({
						...ctx,
						assignmentItemId,
						collectionId: param('collectionId'),
						collectedAtTimestamp: readDate(payload.collectedAt) ?? new Date(Number.NaN),
						collectedByProfileId: readNullableText(payload.collectedByProfileId),
						hasProblem: payload.hasProblem === true,
						completedAt: readDate(payload.completedAt),
						...readExecutionOptions(payload),
					});
				}
				return collectCollectionCommand({
					...ctx,
					collectionId: param('collectionId'),
					collectedAt: readDate(payload.collectedAt) ?? new Date(Number.NaN),
					collectedByProfileId: readNullableText(payload.collectedByProfileId),
					hasProblem: payload.hasProblem === true,
					metadata: payload.metadata ?? null,
				});
			},
			run: (context, commands) => runCollectionCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/adult-surveillance/collections/:collectionId/cancel',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				cancelPendingCollectionCommand({
					...ctx,
					collectionId: param('collectionId'),
				}),
			run: (context, commands) => runCollectionCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/adult-surveillance/collections/:collectionId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ payload, agency: ctx, param }) =>
				deleteCollectionCommand({
					...ctx,
					collectionId: param('collectionId'),
					acknowledgedSpeciesCountDeletion: payload.acknowledgedSpeciesCountDeletion !== false,
				}),
			run: (context, commands) => runCollectionCommands(context, options.db, commands),
		}),
	);
}

function buildCollectionCreateCommand(
	authContext: AuthContext,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly command: CollectionCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const collectionId = readText(payload.id) ?? '';
	const timing = readCollectionTiming(payload);
	const collected = isCollectedTiming(timing);
	const trapId = readNullableText(payload.trapId);
	const metadata = payload.metadata ?? null;
	const setByProfileId = readNullableText(payload.setByProfileId);

	// Setting or emptying a trap off an assignment stop closes the stop in the
	// same transaction. `trapId` may be omitted — the stop already names one.
	const assignmentItemId = readNullableText(payload.assignmentItemId);
	if (assignmentItemId !== null) {
		const execution = {
			...ctx,
			assignmentItemId,
			collectionId,
			trapId,
			metadata,
			completedAt: readDate(payload.completedAt),
			...readExecutionOptions(payload),
		};
		if (collected) {
			return createCommand(() =>
				recordCollectedTrapCollectionForAssignmentItemCommand({
					...execution,
					timing: timing as CollectedCollectionTiming,
					setByProfileId,
					collectedByProfileId: readNullableText(payload.collectedByProfileId),
					hasProblem: payload.hasProblem === true,
				}),
			);
		}
		return createCommand(() =>
			setTrapCollectionForAssignmentItemCommand({
				...execution,
				startedAt: pendingStartedAt(timing),
				setByProfileId,
			}),
		);
	}

	if (trapId !== null) {
		if (collected) {
			return createCommand(() =>
				recordCollectedTrapCollectionCommand({
					...ctx,
					collectionId,
					trapId,
					timing: timing as CollectedCollectionTiming,
					setByProfileId,
					collectedByProfileId: readNullableText(payload.collectedByProfileId),
					hasProblem: payload.hasProblem === true,
					acknowledgedPendingTrapCollection: true,
					metadata,
				}),
			);
		}
		return createCommand(() =>
			setTrapCollectionCommand({
				...ctx,
				collectionId,
				trapId,
				startedAt: pendingStartedAt(timing),
				setByProfileId,
				metadata,
			}),
		);
	}

	const collectionMethodId = readText(payload.collectionMethodId) ?? '';
	const locationSource = payload.locationSource as AdultCollectionLocationSourceInput;
	const collectionLureId = readNullableText(payload.collectionLureId);
	const addressId = readNullableText(payload.addressId);

	if (collected) {
		return createCommand(() =>
			recordCollectedAdHocCollectionCommand({
				...ctx,
				collectionId,
				collectionMethodId,
				locationSource,
				collectionLureId,
				addressId,
				timing: timing as CollectedCollectionTiming,
				setByProfileId,
				collectedByProfileId: readNullableText(payload.collectedByProfileId),
				hasProblem: payload.hasProblem === true,
				metadata,
			}),
		);
	}

	return createCommand(() =>
		setAdHocCollectionCommand({
			...ctx,
			collectionId,
			collectionMethodId,
			locationSource,
			collectionLureId,
			addressId,
			startedAt: pendingStartedAt(timing),
			setByProfileId,
			metadata,
		}),
	);
}

function buildCollectionUpdateCommands(
	authContext: AuthContext,
	collectionId: string,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly commands: readonly CollectionCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const commands: CollectionCommand[] = [];

	const hasMethod = 'collectionMethodId' in payload;
	const hasLocation = 'locationSource' in payload;
	const hasLure = 'collectionLureId' in payload;
	const hasAddress = 'addressId' in payload;
	if (hasMethod || hasLocation || hasLure || hasAddress) {
		const result = createCommand(() =>
			updateAdHocCollectionConfigurationCommand({
				...ctx,
				collectionId,
				...(hasMethod ? { collectionMethodId: readText(payload.collectionMethodId) ?? '' } : {}),
				...(hasLocation
					? { locationSource: payload.locationSource as AdultCollectionLocationSourceInput }
					: {}),
				...(hasLure ? { collectionLureId: readNullableText(payload.collectionLureId) } : {}),
				...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const hasTiming = hasTimingFields(payload);
	const hasSetBy = 'setByProfileId' in payload;
	const hasCollectedBy = 'collectedByProfileId' in payload;
	const hasProblem = 'hasProblem' in payload;
	const hasMetadata = 'metadata' in payload;
	if (hasTiming || hasSetBy || hasCollectedBy || hasProblem || hasMetadata) {
		const result = createCommand(() =>
			updateCollectionFieldDetailsCommand({
				...ctx,
				collectionId,
				...(hasTiming ? { timing: readCollectionTiming(payload) } : {}),
				...(hasSetBy ? { setByProfileId: readNullableText(payload.setByProfileId) } : {}),
				...(hasCollectedBy
					? { collectedByProfileId: readNullableText(payload.collectedByProfileId) }
					: {}),
				...(hasProblem ? { hasProblem: payload.hasProblem === true } : {}),
				...(hasMetadata ? { metadata: payload.metadata ?? null } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isZeroResult === 'boolean') {
		const result = createCommand(() =>
			payload.isZeroResult
				? markCollectionZeroResultCommand({
						...ctx,
						collectionId,
						acknowledgedSpeciesCountsClearance: true,
					})
				: clearCollectionZeroResultCommand({ ...ctx, collectionId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.hasBycatch === 'boolean') {
		const result = createCommand(() =>
			setCollectionBycatchCommand({
				...ctx,
				collectionId,
				hasBycatch: payload.hasBycatch === true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('collection');
	}

	return { ok: true, commands };
}

async function runCollectionCommands(
	context: CommandContext,
	db: AdultSurveillanceDb,
	commands: readonly CollectionCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeCollectionCommand, notFound: 'collection_not_found', key: 'collection' },
		commands,
		createdStatus,
	);
}

async function writeCollectionCommand(
	trx: AdultSurveillanceTransaction,
	command: CollectionCommand,
): Promise<SafeCollection | null> {
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
			);
		case 'adultSurveillance.markCollectionZeroResult': {
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
type CollectionCommand =
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
		completeItem: payload.completeAssignmentItem,
		completedAt: payload.completedAt,
	};
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
): Promise<SafeCollection | null> {
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
): Promise<SafeCollection | null> {
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
): Promise<SafeCollection | null> {
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
): Promise<SafeCollection> {
	const row = await trx
		.insertInto('collections')
		.values({
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
		})
		.returning(collectionReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeCollection(row);
}

async function updateCollection(
	trx: AdultSurveillanceTransaction,
	collectionId: string,
	organizationId: string,
	set: CollectionUpdateColumns,
): Promise<SafeCollection | null> {
	const row = await trx
		.updateTable('collections')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', collectionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeCollection(row);
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
): Promise<SafeCollection | null> {
	await applyRecordDeletion(trx, {
		recordType: 'collection',
		recordId: collectionId,
		organizationId,
		actorProfileId,
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
		.returning(collectionReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeCollection(row);
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
