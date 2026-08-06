import { applyRecordDeletion } from '@simmer-mosquito/db';
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
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	createCommand,
	type FoundationDb,
	type FoundationTransaction,
	geojsonToGeom,
	handleCommandError,
	invalidUpdate,
	type RouteOptions,
	readJsonObject,
	regionReturnColumns,
	type SafeRegion,
	softDelete,
	toSafeRegion,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Regions
// ===========================================================================

export function registerRegionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/foundation/regions', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			createRegionCommand({
				...ctx,
				regionId: readText(p.id) ?? '',
				regionFolderId: readNullableText(p.regionFolderId),
				name: readText(p.name) ?? '',
				description: readNullableText(p.description),
				metadata: p.metadata ?? null,
				geometry: p.geometry,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRegionCommands(context, options.db, [result.command], 201);
	});

	app.patch('/foundation/regions/:regionId', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const commandsResult = buildRegionUpdateCommands(
			context.get('authContext'),
			context.req.param('regionId'),
			raw.payload,
		);
		if (!commandsResult.ok) {
			return context.json(commandsResult.body, 400);
		}
		return runRegionCommands(context, options.db, commandsResult.commands);
	});

	app.delete('/foundation/regions/:regionId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			deleteRegionCommand({
				...ctx,
				regionId: context.req.param('regionId'),
				acknowledgedRegionDelete: true,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRegionCommands(context, options.db, [result.command]);
	});
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
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(db, commands, writeRegionCommand);
		if (result.row === null) {
			return context.json({ error: 'region_not_found' }, 404);
		}
		return context.json({ region: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRegionCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<SafeRegion | null> {
	switch (command.type) {
		case 'foundation.createRegion': {
			const row = await trx
				.insertInto('regions')
				.values({
					id: command.payload.regionId,
					organization_id: command.payload.organizationId,
					region_folder_id: command.payload.regionFolderId,
					geom: geojsonToGeom(command.payload.geometry),
					name: command.payload.name,
					description: command.payload.description,
					metadata: command.payload.metadata,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(regionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRegion(row);
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
				toSafeRegion,
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
): Promise<SafeRegion | null> {
	return updateRow(
		trx,
		'regions',
		regionId,
		organizationId,
		set,
		regionReturnColumns,
		toSafeRegion,
	);
}
