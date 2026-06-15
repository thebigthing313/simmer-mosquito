import { randomUUID } from 'node:crypto';
import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	addMissionItemCommand,
	addMissionItemFromRequestedControlActionCommand,
	assignMissionCommand,
	cancelMissionCommand,
	completeMissionCommand,
	completeMissionItemCommand,
	createMissionCommand,
	DomainValidationError,
	deleteMissionCommand,
	type MissionDispatchCommand,
	type MissionItemLocationSourceInput,
	type MissionItemPlacement,
	moveMissionItemsCommand,
	removeMissionItemCommand,
	reopenMissionCommand,
	reopenMissionItemCommand,
	skipMissionItemCommand,
	startMissionCommand,
	unskipMissionItemCommand,
	updateMissionDetailsCommand,
	updateMissionItemLocationAndLinkCommand,
	updateMissionNotificationTypeCommand,
	updateMissionPlanCommand,
	updateMissionScheduleCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type MissionDispatchDb = Kysely<SimmerDatabase>;
type MissionDispatchTransaction = Transaction<SimmerDatabase>;
type CommandContext = Context<{ Variables: AuthVariables }>;

/**
 * Mission dispatch command endpoints: missions and their ordered mission items.
 *
 * Client issues plain optimistic POST/PATCH/DELETE per row; the server decomposes
 * each into the mission-dispatch domain command vocabulary. Mission and mission-
 * item lifecycle transitions are derived from changed timestamp fields in a PATCH;
 * mission items are reindexed on insert/move.
 *
 * NOTE: the cross-domain `record*ForMissionItem` commands (which create control
 * action records linked to a mission item) are intentionally not wired here —
 * control actions are written through their own control-operations collections.
 */
export function registerMissionDispatchCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	registerMissionRoutes(app, options);
	registerMissionItemRoutes(app, options);
}

// ===========================================================================
// Missions
// ===========================================================================

function registerMissionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/mission-dispatch/missions', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			createMissionCommand({
				...ctx,
				missionId: readText(p.id) ?? '',
				controlType: (readText(p.controlType) ?? '') as never,
				scheduledStartAt: readDate(p.scheduledStartAt) ?? new Date(Number.NaN),
				missionName: readNullableText(p.missionName),
				plannedMethodId: readNullableText(p.plannedMethodId),
				assignedToProfileId: readNullableText(p.assignedToProfileId),
				scheduledEndAt: readDate(p.scheduledEndAt),
				rainDate: readNullableText(p.rainDate),
				notificationTypeId: readNullableText(p.notificationTypeId),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runMissionCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/mission-dispatch/missions/:missionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildMissionUpdateCommands(
				context.get('authContext'),
				context.req.param('missionId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runMissionCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/mission-dispatch/missions/:missionId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteMissionCommand({ ...ctx, missionId: context.req.param('missionId') }),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runMissionCommands(context, options.db, [result.command]);
		},
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
				reopenReason: 'Reopened',
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
	try {
		const result = await writeCommands(db, commands, writeMissionCommand);
		if (result.row === null) {
			return context.json({ error: 'mission_not_found' }, 404);
		}
		return context.json({ mission: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeMissionCommand(
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
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				started_at: command.payload.startedAt === null ? sql`now()` : command.payload.startedAt,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.completeMission':
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				completed_at:
					command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.cancelMission':
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				cancelled_at:
					command.payload.cancelledAt === null ? sql`now()` : command.payload.cancelledAt,
				cancellation_reason: command.payload.cancellationReason,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.reopenMission':
			return updateMission(trx, command.payload.missionId, command.payload.organizationId, {
				started_at: null,
				completed_at: null,
				cancelled_at: null,
				cancellation_reason: null,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'missionDispatch.deleteMission':
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

// ===========================================================================
// Mission items
// ===========================================================================

function registerMissionItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/mission-dispatch/mission-items', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const fromRca = readNullableText(p.requestedControlActionId);
		const hasLocation = p.locationSource !== undefined || p.geometry !== undefined;
		const result =
			fromRca !== null && !hasLocation
				? createCommand(() =>
						addMissionItemFromRequestedControlActionCommand({
							...ctx,
							missionItemId: readText(p.id) ?? '',
							missionId: readText(p.missionId) ?? '',
							requestedControlActionId: fromRca,
							...(p.placement === undefined
								? {}
								: { placement: p.placement as MissionItemPlacement }),
						}),
					)
				: createCommand(() =>
						addMissionItemCommand({
							...ctx,
							missionItemId: readText(p.id) ?? '',
							missionId: readText(p.missionId) ?? '',
							...(p.geometry === undefined ? {} : { geometry: p.geometry }),
							...(p.locationSource === undefined
								? {}
								: { locationSource: p.locationSource as MissionItemLocationSourceInput }),
							addressId: readNullableText(p.addressId),
							requestedControlActionId: fromRca,
							...(p.placement === undefined
								? {}
								: { placement: p.placement as MissionItemPlacement }),
						}),
					);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runMissionItemCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/mission-dispatch/mission-items/:missionItemId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildMissionItemUpdateCommands(
				context.get('authContext'),
				context.req.param('missionItemId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runMissionItemCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/mission-dispatch/mission-items/:missionItemId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeMissionItemCommand({ ...ctx, missionItemId: context.req.param('missionItemId') }),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runMissionItemCommands(context, options.db, [result.command]);
		},
	);

	app.post(
		'/mission-dispatch/missions/:missionId/move-items',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				moveMissionItemsCommand({
					...ctx,
					missionId: context.req.param('missionId'),
					missionItemIds: readStringArray(raw.payload.missionItemIds),
					placement: raw.payload.placement as MissionItemPlacement,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runMissionItemCommands(context, options.db, [result.command]);
		},
	);
}

function buildMissionItemUpdateCommands(
	authContext: AuthContext,
	missionItemId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
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
				acknowledgedNotificationGeometryChange: true,
				acknowledgedActualActionContextChange: true,
				acknowledgedProgressedItemLinkChange: true,
				acknowledgedMethodMismatch: true,
				acknowledgedDuplicateRequestedActionMissioning: true,
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
	try {
		const result = await writeCommands(db, commands, writeMissionItemCommand);
		if (result.row === null) {
			return context.json({ error: 'mission_item_not_found' }, 404);
		}
		return context.json({ missionItem: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeMissionItemCommand(
	trx: MissionDispatchTransaction,
	command: MissionDispatchCommand,
): Promise<SafeMissionItem | null> {
	switch (command.type) {
		case 'missionDispatch.addMissionItem': {
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
				position: 0,
				actorProfileId: command.payload.actorProfileId,
			});
			await reindexMissionItems(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				(ids) =>
					applyPlacement(
						ids,
						[command.payload.missionItemId],
						command.payload.placement.kind,
						missionPlacementRef(command.payload.placement),
					),
			);
			return loadMissionItem(trx, command.payload.missionItemId, command.payload.organizationId);
		}
		case 'missionDispatch.addMissionItemFromRequestedControlAction': {
			await insertMissionItem(trx, {
				missionItemId: command.payload.missionItemId,
				organizationId: command.payload.organizationId,
				missionId: command.payload.missionId,
				geom: geojsonToGeom(
					await loadGeojson(
						trx,
						'requested_control_actions',
						command.payload.requestedControlActionId,
						command.payload.organizationId,
					),
				),
				addressId: null,
				requestedControlActionId: command.payload.requestedControlActionId,
				position: 0,
				actorProfileId: command.payload.actorProfileId,
			});
			await reindexMissionItems(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				(ids) =>
					applyPlacement(
						ids,
						[command.payload.missionItemId],
						command.payload.placement.kind,
						missionPlacementRef(command.payload.placement),
					),
			);
			return loadMissionItem(trx, command.payload.missionItemId, command.payload.organizationId);
		}
		case 'missionDispatch.updateMissionItemLocationAndLink': {
			const changes = command.payload.changes;
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
		case 'missionDispatch.completeMissionItem':
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
		case 'missionDispatch.reopenMissionItem':
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
		case 'missionDispatch.skipMissionItem':
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
		case 'missionDispatch.unskipMissionItem':
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
			return softDelete(
				trx,
				'mission_items',
				command.payload.missionItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				missionItemReturnColumns,
				toSafeMissionItem,
			);
		case 'missionDispatch.moveMissionItems': {
			await reindexMissionItems(
				trx,
				command.payload.missionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				(ids) =>
					applyPlacement(
						ids,
						command.payload.missionItemIds,
						command.payload.placement.kind,
						missionPlacementRef(command.payload.placement),
					),
			);
			const first = command.payload.missionItemIds[0];
			return first === undefined
				? null
				: loadMissionItem(trx, first, command.payload.organizationId);
		}
		default:
			throw new Error(`Unsupported mission item command: ${command.type}`);
	}
}

async function insertMissionItem(
	trx: MissionDispatchTransaction,
	input: {
		readonly missionItemId: string;
		readonly organizationId: string;
		readonly missionId: string;
		readonly geom: ReturnType<typeof geojsonToGeom>;
		readonly addressId: string | null;
		readonly requestedControlActionId: string | null;
		readonly position: number;
		readonly actorProfileId: string;
	},
): Promise<void> {
	await trx
		.insertInto('mission_items')
		.values({
			id: input.missionItemId,
			organization_id: input.organizationId,
			mission_id: input.missionId,
			requested_control_action_id: input.requestedControlActionId,
			geom: input.geom,
			address_id: input.addressId,
			position: input.position,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.execute();
}

async function updateMissionItemRow(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<SafeMissionItem | null> {
	return updateRow(
		trx,
		'mission_items',
		missionItemId,
		organizationId,
		set,
		missionItemReturnColumns,
		toSafeMissionItem,
	);
}

async function loadMissionItem(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
): Promise<SafeMissionItem | null> {
	const row = await trx
		.selectFrom('mission_items')
		.select(missionItemReturnColumns)
		.where('id', '=', missionItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined ? null : toSafeMissionItem(row);
}

async function reindexMissionItems(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	actorProfileId: string,
	reorder: (orderedIds: readonly string[]) => readonly string[],
): Promise<void> {
	const rows = await trx
		.selectFrom('mission_items')
		.select('id')
		.where('mission_id', '=', missionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
	const ordered = reorder(rows.map((row) => row.id));
	for (let index = 0; index < ordered.length; index += 1) {
		await trx
			.updateTable('mission_items')
			.set({ position: index, updated_by_profile_id: actorProfileId, updated_at: sql`now()` })
			.where('id', '=', ordered[index] as string)
			.where('organization_id', '=', organizationId)
			.execute();
	}
}

function applyPlacement(
	orderedIds: readonly string[],
	movingIds: readonly string[],
	kind: 'start' | 'end' | 'before' | 'after',
	refId: string | null,
): readonly string[] {
	const moving = movingIds.filter((id) => orderedIds.includes(id));
	const remaining = orderedIds.filter((id) => !moving.includes(id));
	if (kind === 'start') {
		return [...moving, ...remaining];
	}
	if (kind === 'before' || kind === 'after') {
		const refIndex = refId === null ? -1 : remaining.indexOf(refId);
		if (refIndex !== -1) {
			const insertAt = kind === 'before' ? refIndex : refIndex + 1;
			return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
		}
	}
	return [...remaining, ...moving];
}

function missionPlacementRef(placement: MissionItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after' ? placement.missionItemId : null;
}

// ===========================================================================
// Geometry resolution
// ===========================================================================

type GeomTable =
	| 'addresses'
	| 'habitats'
	| 'inspections'
	| 'traps'
	| 'collections'
	| 'service_requests'
	| 'requested_control_actions';

async function resolveInitialItemGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	item: {
		readonly kind: 'explicit' | 'fromRequestedControlAction';
		readonly geometry?: unknown;
		readonly locationSource?: { readonly kind: string } & Record<string, unknown>;
		readonly requestedControlActionId?: string | null;
	},
): Promise<ReturnType<typeof geojsonToGeom>> {
	if (item.kind === 'fromRequestedControlAction') {
		return geojsonToGeom(
			await loadGeojson(
				trx,
				'requested_control_actions',
				item.requestedControlActionId as string,
				organizationId,
			),
		);
	}
	return resolveItemGeom(trx, organizationId, {
		geometry: item.geometry,
		locationSource: item.locationSource,
		requestedControlActionId: item.requestedControlActionId ?? null,
	});
}

async function resolveItemGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	input: {
		readonly geometry?: unknown;
		readonly locationSource?: ({ readonly kind: string } & Record<string, unknown>) | undefined;
		readonly requestedControlActionId?: string | null;
	},
): Promise<ReturnType<typeof geojsonToGeom>> {
	if (input.geometry !== undefined) {
		return geojsonToGeom(input.geometry);
	}
	if (input.locationSource !== undefined) {
		return resolveLocationSourceGeom(trx, organizationId, input.locationSource);
	}
	if (input.requestedControlActionId != null) {
		return geojsonToGeom(
			await loadGeojson(
				trx,
				'requested_control_actions',
				input.requestedControlActionId,
				organizationId,
			),
		);
	}
	throw new CommandError(400, { error: 'mission_item_location_required' });
}

async function resolveLocationSourceGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	source: { readonly kind: string } & Record<string, unknown>,
): Promise<ReturnType<typeof geojsonToGeom>> {
	switch (source.kind) {
		case 'geometry':
			return geojsonToGeom(source.geometry);
		case 'address':
			return geojsonToGeom(
				await loadGeojson(trx, 'addresses', source.addressId as string, organizationId),
			);
		case 'habitat':
			return geojsonToGeom(
				await loadGeojson(trx, 'habitats', source.habitatId as string, organizationId),
			);
		case 'inspection':
			return geojsonToGeom(
				await loadGeojson(trx, 'inspections', source.inspectionId as string, organizationId),
			);
		case 'trap':
			return geojsonToGeom(
				await loadGeojson(trx, 'traps', source.trapId as string, organizationId),
			);
		case 'collection':
			return geojsonToGeom(
				await loadGeojson(trx, 'collections', source.collectionId as string, organizationId),
			);
		case 'serviceRequest':
			return geojsonToGeom(
				await loadGeojson(
					trx,
					'service_requests',
					source.serviceRequestId as string,
					organizationId,
				),
			);
		case 'requestedControlAction':
			return geojsonToGeom(
				await loadGeojson(
					trx,
					'requested_control_actions',
					source.requestedControlActionId as string,
					organizationId,
				),
			);
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

async function loadGeojson(
	trx: MissionDispatchTransaction,
	table: GeomTable,
	id: string,
	organizationId: string,
): Promise<unknown> {
	const row = await trx
		.selectFrom(table)
		.select('geojson')
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: `${table}_not_found` });
	}
	return row.geojson;
}

// ===========================================================================
// Lifecycle transition derivation
// ===========================================================================

type MissionLifecycle = 'start' | 'complete' | 'cancel' | 'reopen' | null;

function readLifecycleTransition(payload: Record<string, unknown>): MissionLifecycle {
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('cancelledAt' in payload && payload.cancelledAt !== null) {
		return 'cancel';
	}
	if ('startedAt' in payload && payload.startedAt !== null) {
		return 'start';
	}
	if (
		('completedAt' in payload && payload.completedAt === null) ||
		('cancelledAt' in payload && payload.cancelledAt === null) ||
		('startedAt' in payload && payload.startedAt === null)
	) {
		return 'reopen';
	}
	return null;
}

type ItemLifecycle = 'complete' | 'skip' | 'reopen' | 'unskip' | null;

function readItemLifecycleTransition(payload: Record<string, unknown>): ItemLifecycle {
	if ('skippedAt' in payload && payload.skippedAt !== null) {
		return 'skip';
	}
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('skippedAt' in payload && payload.skippedAt === null) {
		return 'unskip';
	}
	if ('completedAt' in payload && payload.completedAt === null) {
		return 'reopen';
	}
	return null;
}

// ===========================================================================
// Generic row helpers
// ===========================================================================

async function updateRow<TRow, TSafe>(
	trx: MissionDispatchTransaction,
	table: 'missions' | 'mission_items',
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function softDelete<TRow, TSafe>(
	trx: MissionDispatchTransaction,
	table: 'missions' | 'mission_items',
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function writeCommands<TSafe>(
	db: MissionDispatchDb,
	commands: readonly MissionDispatchCommand[],
	write: (
		trx: MissionDispatchTransaction,
		command: MissionDispatchCommand,
	) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

// ===========================================================================
// Response shaping
// ===========================================================================

const missionReturnColumns = [
	'id',
	'organization_id',
	'mission_name',
	'control_type',
	'planned_method_id',
	'assigned_to_profile_id',
	'scheduled_start_at',
	'scheduled_end_at',
	'started_at',
	'completed_at',
	'cancelled_at',
	'notification_type_id',
	'created_at',
	'updated_at',
] as const;

interface SafeMission {
	readonly id: string;
	readonly organizationId: string;
	readonly missionName: string | null;
	readonly controlType: string;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeMission(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly mission_name: string | null;
	readonly control_type: string;
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeMission {
	return {
		id: row.id,
		organizationId: row.organization_id,
		missionName: row.mission_name,
		controlType: row.control_type,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		cancelledAt: row.cancelled_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const missionItemReturnColumns = [
	'id',
	'organization_id',
	'mission_id',
	'requested_control_action_id',
	'address_id',
	'position',
	'completed_at',
	'skipped_at',
	'skip_reason',
	'created_at',
	'updated_at',
] as const;

interface SafeMissionItem {
	readonly id: string;
	readonly organizationId: string;
	readonly missionId: string;
	readonly requestedControlActionId: string | null;
	readonly addressId: string | null;
	readonly position: number;
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeMissionItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly mission_id: string;
	readonly requested_control_action_id: string | null;
	readonly address_id: string | null;
	readonly position: number;
	readonly completed_at: Date | null;
	readonly skipped_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeMissionItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		missionId: row.mission_id,
		requestedControlActionId: row.requested_control_action_id,
		addressId: row.address_id,
		position: row.position,
		completedAt: row.completed_at,
		skippedAt: row.skipped_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

interface RouteOptions {
	readonly db: MissionDispatchDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

type CommandsResult =
	| { readonly ok: true; readonly commands: readonly MissionDispatchCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

class CommandError extends Error {
	constructor(
		readonly status: 400 | 404,
		readonly body: { readonly error: string },
	) {
		super(body.error);
	}
}

function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	throw error;
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

function createCommand<TCommand extends MissionDispatchCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: { error: 'invalid_command', message: error.message, issues: error.issues },
			};
		}
		throw error;
	}
}

function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function geojsonToGeom(geojson: unknown) {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
}

function localDateColumn(value: string) {
	return sql<Date>`${value}::date`;
}

async function readCurrentTransactionId(trx: MissionDispatchTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readNullableText(value: unknown): string | null {
	return readText(value);
}

function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function readStringArray(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
