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
	type CommandContext,
	commandEndpoint,
	type FoundationDb,
	type FoundationTransaction,
	handleCommandError,
	type RouteOptions,
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
	app.post(
		'/foundation/region-folders',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createRegionFolderCommand({
					...ctx,
					regionFolderId: readText(payload.id) ?? '',
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
				}),
			run: (context, commands) => runRegionFolderCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/foundation/region-folders/:regionFolderId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateRegionFolderCommand({
					...ctx,
					regionFolderId: param('regionFolderId'),
					...('name' in payload ? { name: readText(payload.name) ?? '' } : {}),
					...('description' in payload
						? { description: readNullableText(payload.description) }
						: {}),
				}),
			run: (context, commands) => runRegionFolderCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/foundation/region-folders/:regionFolderId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteRegionFolderCommand({
					...ctx,
					regionFolderId: param('regionFolderId'),
					acknowledgedRegionDetach: true,
				}),
			run: (context, commands) => runRegionFolderCommands(context, options.db, commands),
		}),
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
