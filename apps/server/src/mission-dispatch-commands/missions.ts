import { randomUUID } from 'node:crypto';
import {
	applyRecordDeletion,
	assertWriteReferences,
	type CatalogReference,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
import {
	assignMissionCommand,
	cancelMissionCommand,
	completeMissionCommand,
	createMissionCommand,
	deleteMissionCommand,
	type MissionDispatchCommand,
	reopenMissionCommand,
	startMissionCommand,
	updateMissionDetailsCommand,
	updateMissionNotificationTypeCommand,
	updateMissionPlanCommand,
	updateMissionScheduleCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { acknowledged, readNullableText, readText } from '../command-payload.js';
import { insertLifecycleComment } from '../lifecycle-comment.js';
import {
	assertCompletedMissionDeletionAcknowledged,
	assertEarlyStartAcknowledged,
	assertInProgressAssignmentChangeAcknowledged,
	assertNotificationImpactAcknowledged,
	assertPartialWorkCancellationAcknowledged,
	assertProgressedMissionCancellationAcknowledged,
	assertRequestedActionAcknowledged,
	assertWorkedMissionPlanChangeAcknowledged,
	assertWorkedMissionScheduleChangeAcknowledged,
	NOTIFICATION_IMPACT_MESSAGES,
} from './mission-acknowledgements.js';
import { moveMissionItemRows } from './mission-items.js';
import {
	assertMissionTransition,
	checkCancelMission,
	checkCompleteMission,
	checkReopenMission,
	checkStartMission,
} from './mission-lifecycle.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	insertMissionItem,
	invalidUpdate,
	localDateColumn,
	type MissionDispatchDb,
	type MissionDispatchTransaction,
	type MissionRow,
	missionReturnColumns,
	type RouteOptions,
	readDate,
	readLifecycleTransition,
	resolveInitialItemGeom,
	runCommands,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Missions
// ===========================================================================

export function registerMissionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/mission-dispatch/missions',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createMissionCommand({
					...ctx,
					missionId: readText(payload.id) ?? '',
					controlType: (readText(payload.controlType) ?? '') as never,
					scheduledStartAt: readDate(payload.scheduledStartAt) ?? new Date(Number.NaN),
					missionName: readNullableText(payload.missionName),
					plannedMethodId: readNullableText(payload.plannedMethodId),
					assignedToProfileId: readNullableText(payload.assignedToProfileId),
					scheduledEndAt: readDate(payload.scheduledEndAt),
					rainDate: readNullableText(payload.rainDate),
					notificationTypeId: readNullableText(payload.notificationTypeId),
					acknowledgedDuplicateRequestedActionMissioning: acknowledged(
						payload,
						'acknowledgedDuplicateRequestedActionMissioning',
					),
					acknowledgedMethodMismatch: acknowledged(payload, 'acknowledgedMethodMismatch'),
				}),
			run: (context, commands) => runMissionCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/mission-dispatch/missions/:missionId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildMissionUpdateCommands(authContext, param('missionId'), payload),
			run: (context, commands) => runMissionCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/mission-dispatch/missions/:missionId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ agency: ctx, param, payload }) =>
				deleteMissionCommand({
					...ctx,
					missionId: param('missionId'),
					acknowledgedMissionItemDeletion: acknowledged(payload, 'acknowledgedMissionItemDeletion'),
					acknowledgedActualActionDetach: acknowledged(payload, 'acknowledgedActualActionDetach'),
					acknowledgedNotificationDeletion: acknowledged(
						payload,
						'acknowledgedNotificationDeletion',
					),
					// The mission's own state rather than something hanging off it, so
					// it is read by the state guard rather than by the registry.
					acknowledgedCompletedMissionDeletion: acknowledged(
						payload,
						'acknowledgedCompletedMissionDeletion',
					),
				}),
			run: (context, commands) => runMissionCommands(context, options.db, commands),
		}),
	);
}

function buildMissionUpdateCommands(
	authContext: AuthContext,
	missionId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: MissionDispatchCommand[] = [];

	if ('missionName' in payload) {
		const result = createCommand(() =>
			updateMissionDetailsCommand({
				...ctx,
				missionId,
				missionName: readNullableText(payload.missionName),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	const hasSchedule =
		'scheduledStartAt' in payload || 'scheduledEndAt' in payload || 'rainDate' in payload;
	if (hasSchedule) {
		const result = createCommand(() =>
			updateMissionScheduleCommand({
				...ctx,
				missionId,
				...('scheduledStartAt' in payload
					? { scheduledStartAt: readDate(payload.scheduledStartAt) ?? new Date(Number.NaN) }
					: {}),
				...('scheduledEndAt' in payload
					? { scheduledEndAt: readDate(payload.scheduledEndAt) }
					: {}),
				...('rainDate' in payload ? { rainDate: readNullableText(payload.rainDate) } : {}),
				acknowledgedNotificationTimingChange: acknowledged(
					payload,
					'acknowledgedNotificationTimingChange',
				),
				acknowledgedWorkedMissionScheduleChange: acknowledged(
					payload,
					'acknowledgedWorkedMissionScheduleChange',
				),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('controlType' in payload || 'plannedMethodId' in payload) {
		const result = createCommand(() =>
			updateMissionPlanCommand({
				...ctx,
				missionId,
				...('controlType' in payload
					? { controlType: (readText(payload.controlType) ?? '') as never }
					: {}),
				...('plannedMethodId' in payload
					? { plannedMethodId: readNullableText(payload.plannedMethodId) }
					: {}),
				acknowledgedNotificationPlanChange: acknowledged(
					payload,
					'acknowledgedNotificationPlanChange',
				),
				acknowledgedWorkedMissionPlanChange: acknowledged(
					payload,
					'acknowledgedWorkedMissionPlanChange',
				),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('assignedToProfileId' in payload) {
		const result = createCommand(() =>
			assignMissionCommand({
				...ctx,
				missionId,
				assignedToProfileId: readNullableText(payload.assignedToProfileId),
				acknowledgedInProgressAssignmentChange: acknowledged(
					payload,
					'acknowledgedInProgressAssignmentChange',
				),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('notificationTypeId' in payload) {
		const result = createCommand(() =>
			updateMissionNotificationTypeCommand({
				...ctx,
				missionId,
				notificationTypeId: readNullableText(payload.notificationTypeId),
				acknowledgedNotificationRegenerationImpact: acknowledged(
					payload,
					'acknowledgedNotificationRegenerationImpact',
				),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	const lifecycle = readLifecycleTransition(payload);
	if (lifecycle === 'complete') {
		const result = createCommand(() =>
			completeMissionCommand({ ...ctx, missionId, completedAt: readDate(payload.completedAt) }),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'cancel') {
		const result = createCommand(() =>
			cancelMissionCommand({
				...ctx,
				missionId,
				cancellationCommentId: randomUUID(),
				cancellationReason: readText(payload.cancellationReason) ?? 'Cancelled',
				cancelledAt: readDate(payload.cancelledAt),
				acknowledgedProgressedMissionCancellation: acknowledged(
					payload,
					'acknowledgedProgressedMissionCancellation',
				),
				acknowledgedPartialWorkCancellation: acknowledged(
					payload,
					'acknowledgedPartialWorkCancellation',
				),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'start') {
		const result = createCommand(() =>
			startMissionCommand({
				...ctx,
				missionId,
				startedAt: readDate(payload.startedAt),
				acknowledgedEarlyStart: acknowledged(payload, 'acknowledgedEarlyStart'),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'reopen') {
		const result = createCommand(() =>
			reopenMissionCommand({
				...ctx,
				missionId,
				reopenCommentId: randomUUID(),
				reopenReason: readText(payload.reopenReason) ?? 'Reopened',
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('mission');
	}
	return { ok: true, commands };
}

async function runMissionCommands(
	context: CommandContext,
	db: MissionDispatchDb,
	commands: readonly MissionDispatchCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeMissionCommand, notFound: 'mission_not_found', key: 'mission' },
		commands,
		createdStatus,
	);
}

/** The one catalog a Mission names: the Notification Type it will send under. */
function notificationTypeReference(id: string | null | undefined): CatalogReference[] {
	return [
		{
			column: 'notification_type_id',
			catalog: 'notificationType',
			id: id ?? null,
			label: 'notification type',
		},
	];
}

export async function writeMissionCommand(
	trx: MissionDispatchTransaction,
	command: MissionDispatchCommand,
): Promise<MissionRow | null> {
	switch (command.type) {
		case 'missionDispatch.createMission': {
			// The mission is not in the database yet, so the plan the stops are
			// judged against is the one the command carries rather than a stored one.
			for (const item of command.payload.items) {
				await assertRequestedActionAcknowledged(trx, {
					organizationId: command.payload.organizationId,
					plan: { plannedMethodId: command.payload.plannedMethodId },
					requestedControlActionId: item.requestedControlActionId ?? null,
					acknowledgedMethodMismatch: command.payload.acknowledgedMethodMismatch,
					acknowledgedDuplicateRequestedActionMissioning:
						command.payload.acknowledgedDuplicateRequestedActionMissioning,
				});
			}
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: notificationTypeReference(command.payload.notificationTypeId),
			});
			const row = await trx
				.insertInto('missions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.missionId,
						organization_id: command.payload.organizationId,
						mission_name: command.payload.missionName,
						control_type: command.payload.controlType,
						planned_method_id: command.payload.plannedMethodId,
						assigned_to_profile_id: command.payload.assignedToProfileId,
						assigned_by_profile_id: command.payload.actorProfileId,
						scheduled_start_at: command.payload.scheduledStartAt,
						scheduled_end_at: command.payload.scheduledEndAt,
						...(command.payload.rainDate === null
							? {}
							: { rain_date: localDateColumn(command.payload.rainDate) }),
						notification_type_id: command.payload.notificationTypeId,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(missionReturnColumns)
				.executeTakeFirstOrThrow();
			let position = 0;
			for (const item of command.payload.items) {
				await insertMissionItem(trx, {
					missionItemId: item.missionItemId,
					organizationId: command.payload.organizationId,
					missionId: command.payload.missionId,
					geom: await resolveInitialItemGeom(trx, command.payload.organizationId, item),
					addressId: item.kind === 'explicit' ? item.addressId : null,
					requestedControlActionId:
						item.kind === 'fromRequestedControlAction'
							? item.requestedControlActionId
							: item.requestedControlActionId,
					position,
					actorProfileId: command.payload.actorProfileId,
				});
				position += 1;
			}
			return row;
		}
		case 'missionDispatch.updateMissionDetails':
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				...('missionName' in command.payload.changes
					? { mission_name: command.payload.changes.missionName ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.updateMissionSchedule': {
			await assertWorkedMissionScheduleChangeAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedWorkedMissionScheduleChange,
			);
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionId: command.payload.missionId },
				acknowledgement: 'acknowledgedNotificationTimingChange',
				acknowledged: command.payload.acknowledgedNotificationTimingChange,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationTimingChange,
			});
			const changes = command.payload.changes;
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				...('scheduledStartAt' in changes && changes.scheduledStartAt !== undefined
					? { scheduled_start_at: changes.scheduledStartAt }
					: {}),
				...('scheduledEndAt' in changes
					? { scheduled_end_at: changes.scheduledEndAt ?? null }
					: {}),
				...('rainDate' in changes
					? { rain_date: changes.rainDate === null ? null : localDateColumn(changes.rainDate) }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'missionDispatch.updateMissionPlan': {
			await assertWorkedMissionPlanChangeAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedWorkedMissionPlanChange,
			);
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionId: command.payload.missionId },
				acknowledgement: 'acknowledgedNotificationPlanChange',
				acknowledged: command.payload.acknowledgedNotificationPlanChange,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationPlanChange,
			});
			const changes = command.payload.changes;
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				...('controlType' in changes ? { control_type: changes.controlType } : {}),
				...('plannedMethodId' in changes
					? { planned_method_id: changes.plannedMethodId ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'missionDispatch.assignMission':
			await assertInProgressAssignmentChangeAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedInProgressAssignmentChange,
			);
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				assigned_to_profile_id: command.payload.assignedToProfileId,
				assigned_by_profile_id: command.payload.actorProfileId,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.updateMissionNotificationType':
			await assertNotificationImpactAcknowledged(trx, {
				organizationId: command.payload.organizationId,
				mission: { missionId: command.payload.missionId },
				acknowledgement: 'acknowledgedNotificationRegenerationImpact',
				acknowledged: command.payload.acknowledgedNotificationRegenerationImpact,
				message: NOTIFICATION_IMPACT_MESSAGES.acknowledgedNotificationRegenerationImpact,
			});
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'missions', recordId: command.payload.missionId },
				references: notificationTypeReference(command.payload.notificationTypeId),
			});
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				notification_type_id: command.payload.notificationTypeId,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.startMission':
			await assertMissionTransition(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				checkStartMission,
			);
			await assertEarlyStartAcknowledged(trx, {
				missionId: command.payload.missionId,
				organizationId: command.payload.organizationId,
				at: command.payload.startedAt,
				acknowledged: command.payload.acknowledgedEarlyStart,
			});
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				started_at: command.payload.startedAt === null ? sql`now()` : command.payload.startedAt,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.completeMission': {
			const snapshot = await assertMissionTransition(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				(current) => checkCompleteMission(current, { autoStart: command.payload.autoStartMission }),
			);
			// The documented auto-start: a mission finished without anyone having
			// started it takes `completedAt` as its start, so its window contains
			// the work rather than beginning after it. Folded into this update
			// rather than done as a second write — the row is already locked and
			// both timestamps describe the same commit.
			const autoStart =
				snapshot.state === 'scheduled' && command.payload.autoStartMission
					? {
							started_at:
								command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
						}
					: {};
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				...autoStart,
				completed_at:
					command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'missionDispatch.cancelMission': {
			await assertMissionTransition(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				checkCancelMission,
			);
			// Both after the transition check, so a mission that cannot be cancelled
			// at all is told that rather than asked to confirm what it is losing.
			await assertProgressedMissionCancellationAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedProgressedMissionCancellation,
			);
			await assertPartialWorkCancellationAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedPartialWorkCancellation,
			);
			const cancelled = await updateMission(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				{
					cancelled_at:
						command.payload.cancelledAt === null ? sql`now()` : command.payload.cancelledAt,
					cancellation_reason: command.payload.cancellationReason,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
			if (cancelled === null) {
				return null;
			}
			// The same text twice, deliberately: `missions.cancellation_reason` is the
			// current reason a mission is cancelled and is cleared on reopen, while the
			// comment is the record that it once was, which survives the reopen.
			await insertLifecycleComment(trx, {
				commentId: command.payload.cancellationCommentId,
				organizationId: command.payload.organizationId,
				entityType: 'mission',
				entityId: command.payload.missionId,
				commentText: command.payload.cancellationReason,
				commentedAt: command.payload.cancelledAt,
				actorProfileId: command.payload.actorProfileId,
			});
			return cancelled;
		}
		case 'missionDispatch.reopenMission': {
			await assertMissionTransition(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				checkReopenMission,
			);
			// Preserves `started_at` for the same reason assignment reopen does: the
			// mission returns to in progress, and the original start time is not
			// recoverable from anywhere else.
			const reopened = await updateMission(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				{
					completed_at: null,
					cancelled_at: null,
					cancellation_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
			if (reopened === null) {
				return null;
			}
			// This write clears the terminal fields outright, so without the comment a
			// reopened mission would carry no trace of having been closed or why.
			await insertLifecycleComment(trx, {
				commentId: command.payload.reopenCommentId,
				organizationId: command.payload.organizationId,
				entityType: 'mission',
				entityId: command.payload.missionId,
				commentText: command.payload.reopenReason,
				commentedAt: command.payload.reopenedAt,
				actorProfileId: command.payload.actorProfileId,
			});
			return reopened;
		}
		case 'missionDispatch.deleteMission':
			// Before the registry, because "this mission ran" is a reason not to
			// delete it at all, and hearing it after a list of what would go with it
			// puts the smaller question first.
			await assertCompletedMissionDeletionAcknowledged(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.acknowledgedCompletedMissionDeletion,
			);
			await applyRecordDeletion(trx, {
				recordType: 'mission',
				recordId: command.payload.missionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedMissionItemDeletion: command.payload.acknowledgedMissionItemDeletion,
					acknowledgedActualActionDetach: command.payload.acknowledgedActualActionDetach,
					acknowledgedNotificationDeletion: command.payload.acknowledgedNotificationDeletion,
				},
			});
			return softDelete(
				trx,
				'missions',
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				missionReturnColumns,
			);
		/**
		 * Reordering the stops, which is a command on the mission.
		 *
		 * `position` is a fact about the sequence rather than about any stop in it:
		 * a move takes an id list and a placement, restacks the mission's stops, and
		 * answers with the mission. The write lives beside the stop writes, in
		 * `mission-items.ts`, and touches only the rows that moved. An add is the
		 * same shape: one fractional position between its neighbours.
		 */
		case 'missionDispatch.moveMissionItems': {
			await moveMissionItemRows(trx, command.payload);
			return loadMission(trx, command.payload.missionId, command.payload.organizationId);
		}
		default:
			throw new Error(`Unsupported mission command: ${command.type}`);
	}
}

/** The mission as it stands, for a command that changed its children rather than it. */
async function loadMission(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
): Promise<MissionRow | null> {
	const row = await trx
		.selectFrom('missions')
		.select(missionReturnColumns)
		.where('id', '=', missionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}

async function updateMission(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<MissionRow | null> {
	return updateRow(trx, 'missions', missionId, organizationId, set, missionReturnColumns);
}
