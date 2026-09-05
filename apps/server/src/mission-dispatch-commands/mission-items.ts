import { sql } from '@simmer-mosquito/db';
import {
	addMissionItemCommand,
	addMissionItemFromRequestedControlActionCommand,
	completeMissionItemCommand,
	type MissionDispatchCommand,
	type MissionItemLocationSourceInput,
	type MissionItemPlacement,
	moveMissionItemsCommand,
	removeMissionItemCommand,
	reopenMissionItemCommand,
	skipMissionItemCommand,
	unskipMissionItemCommand,
	updateMissionItemLocationAndLinkCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { acknowledged, readNullableText, readText } from '../command-payload.js';
import { moveItems, nextItemPosition } from '../ordered-items.js';
import {
	assertActualActionContextChangeAcknowledged,
	assertActualActionDetachAcknowledged,
	assertEarlyStartAcknowledged,
	assertInProgressMissionChangeAcknowledged,
	assertItemProgressDeletionAcknowledged,
	assertNotificationImpactAcknowledged,
	assertProgressedItemLinkChangeAcknowledged,
	assertProgressedItemReorderAcknowledged,
	assertRequestedActionAcknowledged,
	NOTIFICATION_IMPACT_MESSAGES,
} from './mission-acknowledgements.js';
import { assertMissionItemProgress, autoStartMissionIfScheduled } from './mission-lifecycle.js';
import {
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	insertMissionItem,
	invalidUpdate,
	loadOr404,
	type MissionDispatchDb,
	type MissionDispatchTransaction,
	type MissionItemRow,
	missionItemReturnColumns,
	organizationCommandContext,
	type RouteOptions,
	readDate,
	readItemLifecycleTransition,
	readStringArray,
	resolveItemGeom,
	runCommands,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Mission items
// ===========================================================================

export function registerMissionItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/mission-dispatch/mission-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx }) => {
				const fromRca = readNullableText(payload.requestedControlActionId);
				const hasLocation = payload.locationSource !== undefined || payload.geometry !== undefined;
				return fromRca !== null && !hasLocation
					? addMissionItemFromRequestedControlActionCommand({
							...ctx,
							missionItemId: readText(payload.id) ?? '',
							missionId: readText(payload.missionId) ?? '',
							requestedControlActionId: fromRca,
							...(payload.placement === undefined
								? {}
								: { placement: payload.placement as MissionItemPlacement }),
							acknowledgedInProgressMissionChange: acknowledged(
								payload,
								'acknowledgedInProgressMissionChange',
							),
							acknowledgedMethodMismatch: acknowledged(payload, 'acknowledgedMethodMismatch'),
							acknowledgedDuplicateRequestedActionMissioning: acknowledged(
								payload,
								'acknowledgedDuplicateRequestedActionMissioning',
							),
							acknowledgedNotificationGeometryChange: acknowledged(
								payload,
								'acknowledgedNotificationGeometryChange',
							),
						})
					: addMissionItemCommand({
							...ctx,
							missionItemId: readText(payload.id) ?? '',
							missionId: readText(payload.missionId) ?? '',
							...(payload.geometry === undefined ? {} : { geometry: payload.geometry }),
							...(payload.locationSource === undefined
								? {}
								: { locationSource: payload.locationSource as MissionItemLocationSourceInput }),
							addressId: readNullableText(payload.addressId),
							requestedControlActionId: fromRca,
							...(payload.placement === undefined
								? {}
								: { placement: payload.placement as MissionItemPlacement }),
							acknowledgedInProgressMissionChange: acknowledged(
								payload,
								'acknowledgedInProgressMissionChange',
							),
							acknowledgedMethodMismatch: acknowledged(payload, 'acknowledgedMethodMismatch'),
							acknowledgedDuplicateRequestedActionMissioning: acknowledged(
								payload,
								'acknowledgedDuplicateRequestedActionMissioning',
							),
							acknowledgedNotificationGeometryChange: acknowledged(
								payload,
								'acknowledgedNotificationGeometryChange',
							),
						});
			},
			run: (context, commands) => runMissionItemCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/mission-dispatch/mission-items/:missionItemId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildMissionItemUpdateCommands(authContext, param('missionItemId'), payload),
			run: (context, commands) => runMissionItemCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/mission-dispatch/mission-items/:missionItemId',
		options.authContextMiddleware,
		commandEndpoint({
			// Optional, not none: a delete that removes a stop's progress has a
			// question to answer, and a body is the only place the answer fits.
			body: 'optional',
			build: ({ organization: ctx, param, payload }) =>
				removeMissionItemCommand({
					...ctx,
					missionItemId: param('missionItemId'),
					acknowledgedItemProgressDeletion: acknowledged(
						payload,
						'acknowledgedItemProgressDeletion',
					),
					acknowledgedActualActionDetach: acknowledged(payload, 'acknowledgedActualActionDetach'),
					acknowledgedNotificationGeometryChange: acknowledged(
						payload,
						'acknowledgedNotificationGeometryChange',
					),
				}),
			run: (context, commands) => runMissionItemCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/mission-dispatch/missions/:missionId/move-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx, param }) =>
				moveMissionItemsCommand({
					...ctx,
					missionId: param('missionId'),
					missionItemIds: readStringArray(payload.missionItemIds),
					placement: payload.placement as MissionItemPlacement,
					acknowledgedProgressedItemReorder: acknowledged(
						payload,
						'acknowledgedProgressedItemReorder',
					),
				}),
			run: (context, commands) => runMissionItemCommands(context, options.db, commands),
		}),
	);
}

function buildMissionItemUpdateCommands(
	authContext: AuthContext,
	missionItemId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = organizationCommandContext(authContext);
	const commands: MissionDispatchCommand[] = [];

	const hasLocationLink =
		'geometry' in payload ||
		'locationSource' in payload ||
		'addressId' in payload ||
		'requestedControlActionId' in payload;
	if (hasLocationLink) {
		const result = createCommand(() =>
			updateMissionItemLocationAndLinkCommand({
				...ctx,
				missionItemId,
				...('geometry' in payload ? { geometry: payload.geometry } : {}),
				...('locationSource' in payload
					? { locationSource: payload.locationSource as MissionItemLocationSourceInput }
					: {}),
				...('addressId' in payload ? { addressId: readNullableText(payload.addressId) } : {}),
				...('requestedControlActionId' in payload
					? { requestedControlActionId: readNullableText(payload.requestedControlActionId) }
					: {}),
				acknowledgedNotificationGeometryChange: acknowledged(
					payload,
					'acknowledgedNotificationGeometryChange',
				),
				acknowledgedActualActionContextChange: acknowledged(
					payload,
					'acknowledgedActualActionContextChange',
				),
				acknowledgedProgressedItemLinkChange: acknowledged(
					payload,
					'acknowledgedProgressedItemLinkChange',
				),
				acknowledgedMethodMismatch: acknowledged(payload, 'acknowledgedMethodMismatch'),
				acknowledgedDuplicateRequestedActionMissioning: acknowledged(
					payload,
					'acknowledgedDuplicateRequestedActionMissioning',
				),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	const lifecycle = readItemLifecycleTransition(payload);
	if (lifecycle === 'skip') {
		const result = createCommand(() =>
			skipMissionItemCommand({
				...ctx,
				missionItemId,
				skippedAt: readDate(payload.skippedAt),
				skipReason: readText(payload.skipReason) ?? '',
				acknowledgedEarlyStart: acknowledged(payload, 'acknowledgedEarlyStart'),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'complete') {
		const result = createCommand(() =>
			completeMissionItemCommand({
				...ctx,
				missionItemId,
				completedAt: readDate(payload.completedAt),
				acknowledgedEarlyStart: acknowledged(payload, 'acknowledgedEarlyStart'),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'unskip') {
		const result = createCommand(() => unskipMissionItemCommand({ ...ctx, missionItemId }));
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'reopen') {
		const result = createCommand(() => reopenMissionItemCommand({ ...ctx, missionItemId }));
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('mission item');
	}
	return { ok: true, commands };
}

async function runMissionItemCommands(
	context: CommandContext,
	db: MissionDispatchDb,
	commands: readonly MissionDispatchCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeMissionItemCommand, notFound: 'mission_item_not_found', key: 'missionItem' },
		commands,
		createdStatus,
	);
}

export async function writeMissionItemCommand(
	trx: MissionDispatchTransaction,
	command: MissionDispatchCommand,
): Promise<MissionItemRow | null> {
	switch (command.type) {
		case 'missionDispatch.addMissionItem': {
			await assertInProgressMissionChangeAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedInProgressMissionChange,
			);
			await assertRequestedActionAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				plan: { missionId: command.payload.missionId },
				requestedControlActionId: command.payload.requestedControlActionId,
				acknowledgedMethodMismatch: command.payload.acknowledgedMethodMismatch,
				acknowledgedDuplicateRequestedActionMissioning:
					command.payload.acknowledgedDuplicateRequestedActionMissioning,
			});
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionId: command.payload.missionId },
				acknowledgement: 'acknowledgedNotificationGeometryChange',
				acknowledged: command.payload.acknowledgedNotificationGeometryChange,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationGeometryChange,
			});
			await insertMissionItem(trx, {
				missionItemId: command.payload.missionItemId,
				organizationId: command.payload.organizationId,
				missionId: command.payload.missionId,
				geom: await resolveItemGeom(trx, command.payload.organizationId, {
					geometry: command.payload.geometry,
					locationSource: command.payload.locationSource,
					requestedControlActionId: command.payload.requestedControlActionId,
				}),
				addressId: command.payload.addressId,
				requestedControlActionId: command.payload.requestedControlActionId,
				position: await missionItemPosition(trx, command.payload),
				actorProfileId: command.payload.actorProfileId,
			});
			return loadMissionItem(trx, command.payload.missionItemId, command.payload.organizationId);
		}
		case 'missionDispatch.addMissionItemFromRequestedControlAction': {
			await assertInProgressMissionChangeAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedInProgressMissionChange,
			);
			await assertRequestedActionAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				plan: { missionId: command.payload.missionId },
				requestedControlActionId: command.payload.requestedControlActionId,
				acknowledgedMethodMismatch: command.payload.acknowledgedMethodMismatch,
				acknowledgedDuplicateRequestedActionMissioning:
					command.payload.acknowledgedDuplicateRequestedActionMissioning,
			});
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionId: command.payload.missionId },
				acknowledgement: 'acknowledgedNotificationGeometryChange',
				acknowledged: command.payload.acknowledgedNotificationGeometryChange,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationGeometryChange,
			});
			await insertMissionItem(trx, {
				missionItemId: command.payload.missionItemId,
				organizationId: command.payload.organizationId,
				missionId: command.payload.missionId,
				geom: await loadOr404(
					trx,
					'requested_control_actions',
					command.payload.requestedControlActionId,
					command.payload.organizationId,
				),
				addressId: null,
				requestedControlActionId: command.payload.requestedControlActionId,
				position: await missionItemPosition(trx, command.payload),
				actorProfileId: command.payload.actorProfileId,
			});
			return loadMissionItem(trx, command.payload.missionItemId, command.payload.organizationId);
		}
		case 'missionDispatch.updateMissionItemLocationAndLink': {
			await assertProgressedItemLinkChangeAcknowledged(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				command.payload.acknowledgedProgressedItemLinkChange,
			);
			await assertActualActionContextChangeAcknowledged(
				trx,
				command.payload.missionItemId,
				command.payload.acknowledgedActualActionContextChange,
			);
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionItemId: command.payload.missionItemId },
				acknowledgement: 'acknowledgedNotificationGeometryChange',
				acknowledged: command.payload.acknowledgedNotificationGeometryChange,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationGeometryChange,
			});
			const changes = command.payload.changes;
			// Only when the link itself moves. Re-asking about the request a stop
			// already carries, because its address changed, would ask the question
			// the caller answered when the stop was raised.
			if ('requestedControlActionId' in changes) {
				await assertRequestedActionAcknowledged(trx, {
					organizationId: command.payload.organizationId,
					plan: { missionItemId: command.payload.missionItemId },
					requestedControlActionId: changes.requestedControlActionId ?? null,
					exceptMissionItemId: command.payload.missionItemId,
					acknowledgedMethodMismatch: command.payload.acknowledgedMethodMismatch,
					acknowledgedDuplicateRequestedActionMissioning:
						command.payload.acknowledgedDuplicateRequestedActionMissioning,
				});
			}
			const geomChange =
				changes.geometry !== undefined || changes.locationSource !== undefined
					? {
							geom: await resolveItemGeom(trx, command.payload.organizationId, {
								geometry: changes.geometry,
								locationSource: changes.locationSource,
								requestedControlActionId:
									'requestedControlActionId' in changes
										? (changes.requestedControlActionId ?? null)
										: null,
							}),
						}
					: {};
			return updateMissionItemRow(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				{
					...geomChange,
					...('addressId' in changes ? { address_id: changes.addressId ?? null } : {}),
					...('requestedControlActionId' in changes
						? { requested_control_action_id: changes.requestedControlActionId ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'missionDispatch.completeMissionItem': {
			const { missionId, snapshot } = await assertMissionItemProgress(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				'complete',
				{
					progressAt: command.payload.completedAt,
					autoStart: command.payload.autoStartMission,
				},
			);
			await assertEarlyStartAcknowledged(trx, {
				missionId,
				organizationId: command.payload.organizationId,
				at: command.payload.completedAt,
				acknowledged: command.payload.acknowledgedEarlyStart,
			});
			await autoStartMissionIfScheduled(trx, missionId, command.payload.organizationId, snapshot, {
				autoStart: command.payload.autoStartMission,
				startedAt: command.payload.completedAt,
				actorProfileId: command.payload.actorProfileId,
			});
			// `skipped_at` is still cleared, but only ever from a pending stop now:
			// the precondition sends a skipped one through unskip first, so the skip
			// and its reason can no longer be erased by a completion nobody meant to
			// overwrite it with.
			return updateMissionItemRow(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				{
					completed_at:
						command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
					completed_by_profile_id: command.payload.actorProfileId,
					skipped_at: null,
					skipped_by_profile_id: null,
					skip_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'missionDispatch.reopenMissionItem':
			await assertMissionItemProgress(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				// Reopening clears the completion rather than dating it, so there is no
				// device timestamp for the start-time rule to judge — and no reason to
				// start a mission in order to un-record something on it.
				'reopen',
				{ progressAt: null, autoStart: false },
			);
			return updateMissionItemRow(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				{
					completed_at: null,
					completed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'missionDispatch.skipMissionItem': {
			const { missionId, snapshot } = await assertMissionItemProgress(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				'skip',
				{ progressAt: command.payload.skippedAt, autoStart: command.payload.autoStartMission },
			);
			await assertEarlyStartAcknowledged(trx, {
				missionId,
				organizationId: command.payload.organizationId,
				at: command.payload.skippedAt,
				acknowledged: command.payload.acknowledgedEarlyStart,
			});
			await autoStartMissionIfScheduled(trx, missionId, command.payload.organizationId, snapshot, {
				autoStart: command.payload.autoStartMission,
				startedAt: command.payload.skippedAt,
				actorProfileId: command.payload.actorProfileId,
			});
			return updateMissionItemRow(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				{
					skipped_at: command.payload.skippedAt === null ? sql`now()` : command.payload.skippedAt,
					skipped_by_profile_id: command.payload.actorProfileId,
					skip_reason: command.payload.skipReason,
					completed_at: null,
					completed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'missionDispatch.unskipMissionItem':
			await assertMissionItemProgress(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				'unskip',
				{ progressAt: null, autoStart: false },
			);
			return updateMissionItemRow(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				{
					skipped_at: null,
					skipped_by_profile_id: null,
					skip_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'missionDispatch.removeMissionItem':
			await assertItemProgressDeletionAcknowledged(
				trx,
				command.payload.missionItemId,
				command.payload.organizationId,
				command.payload.acknowledgedItemProgressDeletion,
			);
			await assertActualActionDetachAcknowledged(
				trx,
				command.payload.missionItemId,
				command.payload.acknowledgedActualActionDetach,
			);
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionItemId: command.payload.missionItemId },
				acknowledgement: 'acknowledgedNotificationGeometryChange',
				acknowledged: command.payload.acknowledgedNotificationGeometryChange,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationGeometryChange,
			});
			return softDelete(
				trx,
				'mission_items',
				command.payload.missionItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				missionItemReturnColumns,
			);
		case 'missionDispatch.moveMissionItems': {
			await moveMissionItemRows(trx, command.payload);
			const first = command.payload.missionItemIds[0];
			return first === undefined
				? null
				: loadMissionItem(trx, first, command.payload.organizationId);
		}
		default:
			throw new Error(`Unsupported mission item command: ${command.type}`);
	}
}

/**
 * Where an added stop lands, from the placement the command carries.
 *
 * Both adds carry the same four fields under different geometry, so this reads
 * the payload once rather than either add spelling the list out.
 */
async function missionItemPosition(
	trx: MissionDispatchTransaction,
	payload: {
		readonly missionItemId: string;
		readonly missionId: string;
		readonly organizationId: string;
		readonly placement: MissionItemPlacement;
	},
): Promise<number> {
	return nextItemPosition(
		trx,
		{
			table: 'mission_items',
			parentColumn: 'mission_id',
			parentId: payload.missionId,
			organizationId: payload.organizationId,
		},
		payload.missionItemId,
		{ kind: payload.placement.kind, refId: missionPlacementRef(payload.placement) },
	);
}

async function updateMissionItemRow(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<MissionItemRow | null> {
	return updateRow(
		trx,
		'mission_items',
		missionItemId,
		organizationId,
		set,
		missionItemReturnColumns,
	);
}

async function loadMissionItem(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
): Promise<MissionItemRow | null> {
	const row = await trx
		.selectFrom('mission_items')
		.select(missionItemReturnColumns)
		.where('id', '=', missionItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}

/**
 * Restack a mission's stops, writing only the rows that moved.
 *
 * `missionDispatch.moveMissionItems` is a command on the *mission* (see
 * `table-commands/missions.ts`) while the stop writes are here, so this stays
 * exported and both writers go through it.
 */
export async function moveMissionItemRows(
	trx: MissionDispatchTransaction,
	payload: {
		readonly missionId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly missionItemIds: readonly string[];
		readonly placement: MissionItemPlacement;
		readonly acknowledgedProgressedItemReorder: boolean;
	},
): Promise<void> {
	// Guarded here rather than at either caller: a move is a command on the
	// mission and a write on the stops, so both writers route through this, and
	// a guard at one of them would be a guard at one door.
	await assertProgressedItemReorderAcknowledged(
		trx,
		payload.organizationId,
		payload.missionItemIds,
		payload.acknowledgedProgressedItemReorder,
	);
	await moveItems(
		trx,
		{
			table: 'mission_items',
			parentColumn: 'mission_id',
			parentId: payload.missionId,
			organizationId: payload.organizationId,
		},
		payload.missionItemIds,
		{ kind: payload.placement.kind, refId: missionPlacementRef(payload.placement) },
		payload.actorProfileId,
	);
}

function missionPlacementRef(placement: MissionItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after' ? placement.missionItemId : null;
}
