import {
	createRegionFolderCommand,
	deleteRegionFolderCommand,
	type FoundationCommand,
	updateRegionFolderCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	type CommandContext,
	createCommand,
	type FoundationDb,
	type FoundationTransaction,
	handleCommandError,
	type RouteOptions,
	readJsonObject,
	regionFolderReturnColumns,
	type SafeRegionFolder,
	softDelete,
	toSafeRegionFolder,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Region folders
// ===========================================================================

export function registerRegionFolderRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/foundation/region-folders', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			createRegionFolderCommand({
				...ctx,
				regionFolderId: readText(raw.payload.id) ?? '',
				name: readText(raw.payload.name) ?? '',
				description: readNullableText(raw.payload.description),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRegionFolderCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/foundation/region-folders/:regionFolderId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const regionFolderId = context.req.param('regionFolderId');
			const result = createCommand(() =>
				updateRegionFolderCommand({
					...ctx,
					regionFolderId,
					...('name' in raw.payload ? { name: readText(raw.payload.name) ?? '' } : {}),
					...('description' in raw.payload
						? { description: readNullableText(raw.payload.description) }
						: {}),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegionFolderCommands(context, options.db, [result.command]);
		},
	);

	app.delete(
		'/foundation/region-folders/:regionFolderId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteRegionFolderCommand({
					...ctx,
					regionFolderId: context.req.param('regionFolderId'),
					acknowledgedRegionDetach: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegionFolderCommands(context, options.db, [result.command]);
		},
	);
}

async function runRegionFolderCommands(
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
		const result = await writeCommands(db, commands, writeRegionFolderCommand);
		if (result.row === null) {
			return context.json({ error: 'region_folder_not_found' }, 404);
		}
		return context.json({ regionFolder: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRegionFolderCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<SafeRegionFolder | null> {
	switch (command.type) {
		case 'foundation.createRegionFolder': {
			const row = await trx
				.insertInto('region_folders')
				.values({
					id: command.payload.regionFolderId,
					organization_id: command.payload.organizationId,
					name: command.payload.name,
					description: command.payload.description,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(regionFolderReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRegionFolder(row);
		}
		case 'foundation.updateRegionFolder':
			return updateRow(
				trx,
				'region_folders',
				command.payload.regionFolderId,
				command.payload.organizationId,
				{
					...('name' in command.payload.changes ? { name: command.payload.changes.name } : {}),
					...('description' in command.payload.changes
						? { description: command.payload.changes.description ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				regionFolderReturnColumns,
				toSafeRegionFolder,
			);
		case 'foundation.deleteRegionFolder':
			return softDelete(
				trx,
				'region_folders',
				command.payload.regionFolderId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				regionFolderReturnColumns,
				toSafeRegionFolder,
			);
		default:
			throw new Error(`Unsupported region folder command: ${command.type}`);
	}
}
