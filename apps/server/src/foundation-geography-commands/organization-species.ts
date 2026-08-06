import {
	type FoundationCommand,
	selectOrganizationSpeciesCommand,
	unselectOrganizationSpeciesCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type CommandContext,
	commandEndpoint,
	type FoundationDb,
	type FoundationTransaction,
	handleCommandError,
	organizationSpeciesReturnColumns,
	type RouteOptions,
	type SafeOrganizationSpecies,
	softDelete,
	toSafeOrganizationSpecies,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Organization species selection
// ===========================================================================

export function registerOrganizationSpeciesRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/foundation/organization-species',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				selectOrganizationSpeciesCommand({
					...ctx,
					organizationSpeciesId: readText(payload.id) ?? '',
					speciesId: readText(payload.speciesId) ?? '',
				}),
			run: (context, commands) =>
				runOrganizationSpeciesCommands(context, options.db, commands, 201),
		}),
	);

	app.delete(
		'/foundation/organization-species/:organizationSpeciesId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				unselectOrganizationSpeciesCommand({
					...ctx,
					organizationSpeciesId: param('organizationSpeciesId'),
				}),
			run: (context, commands) => runOrganizationSpeciesCommands(context, options.db, commands),
		}),
	);
}

async function runOrganizationSpeciesCommands(
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
		const result = await writeCommands(db, commands, writeOrganizationSpeciesCommand);
		if (result.row === null) {
			return context.json({ error: 'organization_species_not_found' }, 404);
		}
		return context.json(
			{ organizationSpecies: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeOrganizationSpeciesCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<SafeOrganizationSpecies | null> {
	switch (command.type) {
		case 'foundation.selectOrganizationSpecies': {
			const row = await trx
				.insertInto('organization_species')
				.values({
					id: command.payload.organizationSpeciesId,
					organization_id: command.payload.organizationId,
					species_id: command.payload.speciesId,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(organizationSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeOrganizationSpecies(row);
		}
		case 'foundation.unselectOrganizationSpecies':
			return softDelete(
				trx,
				'organization_species',
				command.payload.organizationSpeciesId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				organizationSpeciesReturnColumns,
				toSafeOrganizationSpecies,
			);
		default:
			throw new Error(`Unsupported organization species command: ${command.type}`);
	}
}
