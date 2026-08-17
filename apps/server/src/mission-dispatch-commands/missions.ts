import { randomUUID } from 'node:crypto';
import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
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
import { readNullableText, readText } from '../command-payload.js';
import { insertLifecycleComment } from '../lifecycle-comment.js';
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
	missionReturnColumns,
	type RouteOptions,
	readDate,
	readLifecycleTransition,
	resolveInitialItemGeom,
	runCommands,
	type SafeMission,
	softDelete,
	toSafeMission,
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
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteMissionCommand({ ...ctx, missionId: param('missionId') }),
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
				acknowledgedNotificationTimingChange: true,
				acknowledgedWorkedMissionScheduleChange: true,
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
				acknowledgedNotificationPlanChange: true,
				acknowledgedWorkedMissionPlanChange: true,
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
				acknowledgedInProgressAssignmentChange: true,
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
				acknowledgedNotificationRegenerationImpact: true,
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
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'start') {
		const result = createCommand(() =>
			startMissionCommand({ ...ctx, missionId, startedAt: readDate(payload.startedAt) }),
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

export async function writeMissionCommand(
	trx: MissionDispatchTransaction,
	command: MissionDispatchCommand,
): Promise<SafeMission | null> {
	switch (command.type) {
		case 'missionDispatch.createMission': {
			const row = await trx
				.insertInto('missions')
				.values({
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
				})
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
			return toSafeMission(row);
		}
		case 'missionDispatch.updateMissionDetails':
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				...('missionName' in command.payload.changes
					? { mission_name: command.payload.changes.missionName ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.updateMissionSchedule': {
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
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				assigned_to_profile_id: command.payload.assignedToProfileId,
				assigned_by_profile_id: command.payload.actorProfileId,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.updateMissionNotificationType':
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
			await applyRecordDeletion(trx, {
				recordType: 'mission',
				recordId: command.payload.missionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'missions',
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				missionReturnColumns,
				toSafeMission,
			);
		default:
			throw new Error(`Unsupported mission command: ${command.type}`);
	}
}

async function updateMission(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<SafeMission | null> {
	return updateRow(
		trx,
		'missions',
		missionId,
		organizationId,
		set,
		missionReturnColumns,
		toSafeMission,
	);
}
