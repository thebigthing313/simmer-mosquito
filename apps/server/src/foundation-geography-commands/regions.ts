import { applyRecordDeletion, checkedValues } from '@simmer-mosquito/db';
import {
	createRegionCommand,
	deleteRegionCommand,
	type FoundationCommand,
	moveRegionToFolderCommand,
	updateRegionDetailsCommand,
	updateRegionGeometryCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	type FoundationDb,
	type FoundationTransaction,
	geojsonToGeom,
	invalidUpdate,
	type RegionRow,
	type RouteOptions,
	regionReturnColumns,
	runCommands,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Regions
// ===========================================================================

export function registerRegionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/foundation/regions',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createRegionCommand({
					...ctx,
					regionId: readText(payload.id) ?? '',
					regionFolderId: readNullableText(payload.regionFolderId),
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
					metadata: payload.metadata ?? null,
					geometry: payload.geometry,
				}),
			run: (context, commands) => runRegionCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/foundation/regions/:regionId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildRegionUpdateCommands(authContext, param('regionId'), payload),
			run: (context, commands) => runRegionCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/foundation/regions/:regionId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteRegionCommand({
					...ctx,
					regionId: param('regionId'),
					acknowledgedRegionDelete: true,
				}),
			run: (context, commands) => runRegionCommands(context, options.db, commands),
		}),
	);
}

function buildRegionUpdateCommands(
	authContext: AuthContext,
	regionId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: FoundationCommand[] = [];

	if ('name' in payload || 'description' in payload || 'metadata' in payload) {
		const result = createCommand(() =>
			updateRegionDetailsCommand({
				...ctx,
				regionId,
				...('name' in payload ? { name: readText(payload.name) ?? '' } : {}),
				...('description' in payload ? { description: readNullableText(payload.description) } : {}),
				...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('regionFolderId' in payload) {
		const result = createCommand(() =>
			moveRegionToFolderCommand({
				...ctx,
				regionId,
				regionFolderId: readNullableText(payload.regionFolderId),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('geometry' in payload) {
		const result = createCommand(() =>
			updateRegionGeometryCommand({
				...ctx,
				regionId,
				geometry: payload.geometry,
				acknowledgedRegionBoundaryChange: true,
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('region');
	}
	return { ok: true, commands };
}

async function runRegionCommands(
	context: CommandContext,
	db: FoundationDb,
	commands: readonly FoundationCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeRegionCommand, notFound: 'region_not_found', key: 'region' },
		commands,
		createdStatus,
	);
}

/**
 * Exported for `table-commands/regions.ts`, which serves the same five commands
 * at `/commands/regions`. One writer, so the two surfaces cannot write a region
 * differently; only the choosing differs.
 */
export async function writeRegionCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<RegionRow | null> {
	switch (command.type) {
		case 'foundation.createRegion': {
			const row = await trx
				.insertInto('regions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.regionId,
						organization_id: command.payload.organizationId,
						region_folder_id: command.payload.regionFolderId,
						geom: geojsonToGeom(command.payload.geometry),
						name: command.payload.name,
						description: command.payload.description,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(regionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'foundation.updateRegionDetails':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				...('name' in command.payload.changes ? { name: command.payload.changes.name } : {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				...('metadata' in command.payload.changes
					? { metadata: command.payload.changes.metadata ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.moveRegionToFolder':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				region_folder_id: command.payload.regionFolderId,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.updateRegionGeometry':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				geom: geojsonToGeom(command.payload.geometry),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.deleteRegion':
			await applyRecordDeletion(trx, {
				recordType: 'region',
				recordId: command.payload.regionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'regions',
				command.payload.regionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				regionReturnColumns,
			);
		default:
			throw new Error(`Unsupported region command: ${command.type}`);
	}
}

async function updateRegion(
	trx: FoundationTransaction,
	regionId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<RegionRow | null> {
	return updateRow(trx, 'regions', regionId, organizationId, set, regionReturnColumns);
}
