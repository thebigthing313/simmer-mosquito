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
import { readNullableText, readText } from '../command-payload.js';
import { applyPlacement, nextItemPosition } from '../ordered-items.js';
import { assertMissionItemProgress, autoStartMissionIfScheduled } from './mission-lifecycle.js';
import {
	agencyCommandContext,
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
			build: ({ payload, agency: ctx }) => {
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
			body: 'none',
			build: ({ agency: ctx, param }) =>
				removeMissionItemCommand({ ...ctx, missionItemId: param('missionItemId') }),
			run: (context, commands) => runMissionItemCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/mission-dispatch/missions/:missionId/move-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				moveMissionItemsCommand({
					...ctx,
					missionId: param('missionId'),
					missionItemIds: readStringArray(payload.missionItemIds),
					placement: payload.placement as MissionItemPlacement,
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
			return softDelete(
				trx,
				'mission_items',
				command.payload.missionItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				missionItemReturnColumns,
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
 * Renumber a mission's stops 0…n-1 in the order `reorder` puts them.
 *
 * Only `missionDispatch.moveMissionItems` calls this, and it is a command on
 * the *mission* (see `table-commands/missions.ts`) while the stop writes are
 * here, so it stays exported. It writes every active stop, not only the moved
 * ones, the same gap against the domain doc that `reindexItems` has (#196).
 * Adds compute a single fractional position instead; see `ordered-items.ts`.
 */
export async function reindexMissionItems(
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

export function missionPlacementRef(placement: MissionItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after' ? placement.missionItemId : null;
}
