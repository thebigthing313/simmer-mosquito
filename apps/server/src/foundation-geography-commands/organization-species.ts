import {
	type FoundationCommand,
	selectOrganizationSpeciesCommand,
	unselectOrganizationSpeciesCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import {
	type CommandContext,
	commandEndpoint,
	type FoundationDb,
	type FoundationTransaction,
	organizationSpeciesReturnColumns,
	type RouteOptions,
	runCommands,
	type SafeOrganizationSpecies,
	softDelete,
	toSafeOrganizationSpecies,
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
	return runCommands(
		context,
		{
			db,
			write: writeOrganizationSpeciesCommand,
			notFound: 'organization_species_not_found',
			key: 'organizationSpecies',
		},
		commands,
		createdStatus,
	);
}

/** Exported for `table-commands/organization-species.ts` — one writer, two doors. */
export async function writeOrganizationSpeciesCommand(
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
