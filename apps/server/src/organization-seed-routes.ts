/**
 * The six writes `apps/admin` makes while standing a new Organization up.
 *
 * Everything else an organization writes goes to `/commands/{table}`, where the
 * body names the commands it means. These six do not, and they are all that is
 * left of the older per-domain write surface (#634). The operator console seeds
 * a new Organization's geography, its three lookup catalogs and its first Trap
 * from `apps/admin/src/routes/organizations/$organizationId/-foundations-data.ts`,
 * which posts a flat body to a path and reads the created row back. Moving that
 * onto the table surface is a change to `apps/admin`, so it is not this module's
 * to make.
 *
 * **Nothing else belongs here.** A new command goes on `/commands/{table}`;
 * `docs/domain-command-contract.md` names the three shapes that do not fit and
 * this is not one of them. The routes below are the operator seeding path
 * verbatim, and they call the same writers, permission map and transaction the
 * table surface calls, so a record seeded here and a record created in the app
 * cannot disagree.
 *
 * Creates only. The older surface's PATCH and DELETE routes over these tables
 * had no caller in this monorepo and are gone.
 */

import type { TrapLocationSourceInput } from '@simmer-mosquito/domain';
import {
	createCollectionLureCommand,
	createCollectionMethodCommand,
	createHabitatTypeCommand,
	createRegionCommand,
	createRegionFolderCommand,
	createTrapCommand,
	selectOrganizationSpeciesCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { type CommandContext, commandEndpoint } from './command-endpoint.js';
import { acknowledged, readNullableText, readText } from './command-payload.js';
import { denyUnauthorizedOrganizationCommands } from './command-permissions.js';
import { type CommandDb, runCommands } from './command-write.js';
import { writeTrapCommand } from './writers/adult-surveillance/traps.js';
import {
	type AddressCreatePayload,
	type CollectionMethodCreatePayload,
	type LookupCommand,
	readAddressCreatePayload,
	readCollectionMethodCreatePayload,
	writeAddressWithTxid,
} from './writers/foundation/shared.js';
import { writeFoundationLookupCommand } from './writers/foundation/tags.js';
import { writeOrganizationSpeciesCommand } from './writers/foundation-geography/organization-species.js';
import { writeRegionFolderCommand } from './writers/foundation-geography/region-folders.js';
import { writeRegionCommand } from './writers/foundation-geography/regions.js';

/**
 * The address create names a command the permission map answers for, and writes
 * its row directly, so the "command" it builds is a shape rather than a domain
 * builder's output. Same reason the route it came from carried this type.
 */
type CreateAddressCommand = {
	readonly type: 'foundation.createAddress';
	readonly payload: AddressCreatePayload;
};

interface SeedRouteOptions {
	readonly db: CommandDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

/** What one lookup catalog differs by: its path and the command that creates it. */
interface SeedLookupCatalog {
	readonly path: string;
	readonly key: string;
	readonly notFound: string;
	readonly create: (
		organization: { readonly organizationId: string; readonly actorProfileId: string },
		payload: CollectionMethodCreatePayload,
	) => LookupCommand;
}

const seedLookupCatalogs: readonly SeedLookupCatalog[] = [
	{
		path: 'collection-methods',
		key: 'collectionMethod',
		notFound: 'collection_method_not_found',
		create: (organization, payload) =>
			createCollectionMethodCommand({
				...organization,
				collectionMethodId: payload.id,
				name: payload.name,
				description: payload.description,
				customSchema: payload.customSchema,
				actionThreshold: payload.actionThreshold,
			}),
	},
	{
		path: 'collection-lures',
		key: 'collectionLure',
		notFound: 'collection_lure_not_found',
		create: (organization, payload) =>
			createCollectionLureCommand({
				...organization,
				collectionLureId: payload.id,
				name: payload.name,
				description: payload.description,
			}),
	},
	{
		path: 'habitat-types',
		key: 'habitatType',
		notFound: 'habitat_type_not_found',
		create: (organization, payload) =>
			createHabitatTypeCommand({
				...organization,
				habitatTypeId: payload.id,
				name: payload.name,
				description: payload.description,
				customSchema: payload.customSchema,
			}),
	},
];

export function registerOrganizationSeedRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: SeedRouteOptions,
): void {
	registerAddressSeed(app, options);
	registerLookupSeeds(app, options);
	registerGeographySeeds(app, options);
	registerTrapSeed(app, options);
}

/**
 * The address create writes its row directly rather than through a domain
 * writer, so there is no command for `runCommands` to dispatch. It still names
 * the command it implements, because that is what the permission map answers
 * for.
 */
function registerAddressSeed(
	app: Hono<{ Variables: AuthVariables }>,
	options: SeedRouteOptions,
): void {
	app.post(
		'/foundation/addresses',
		options.authContextMiddleware,
		commandEndpoint<CreateAddressCommand, AddressCreatePayload>({
			readPayload: readAddressCreatePayload,
			build: ({ payload }) => ({ type: 'foundation.createAddress', payload }),
			run: async (context, commands) => {
				const denial = denyUnauthorizedOrganizationCommands(context, commands);
				if (denial !== null) {
					return denial;
				}

				const authContext = context.get('authContext');
				const result = await writeAddressWithTxid(options.db, {
					...(commands[0] as CreateAddressCommand).payload,
					organizationId: authContext.organization.id,
					createdByProfileId: authContext.profile.id,
					updatedByProfileId: authContext.profile.id,
				});

				return context.json({ address: result.row, txid: result.txid }, 201);
			},
		}),
	);
}

function registerLookupSeeds(
	app: Hono<{ Variables: AuthVariables }>,
	options: SeedRouteOptions,
): void {
	for (const catalog of seedLookupCatalogs) {
		app.post(
			`/foundation/${catalog.path}`,
			options.authContextMiddleware,
			commandEndpoint({
				readPayload: readCollectionMethodCreatePayload,
				build: ({ payload, organization }) => catalog.create(organization, payload),
				run: (context: CommandContext, commands: readonly LookupCommand[]) =>
					runCommands(
						context,
						{
							db: options.db,
							write: writeFoundationLookupCommand,
							notFound: catalog.notFound,
							key: catalog.key,
						},
						commands,
						201,
					),
			}),
		);
	}
}

function registerGeographySeeds(
	app: Hono<{ Variables: AuthVariables }>,
	options: SeedRouteOptions,
): void {
	app.post(
		'/foundation/region-folders',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx }) =>
				createRegionFolderCommand({
					...ctx,
					regionFolderId: readText(payload.id) ?? '',
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
				}),
			run: (context, commands) =>
				runCommands(
					context,
					{
						db: options.db,
						write: writeRegionFolderCommand,
						notFound: 'region_folder_not_found',
						key: 'regionFolder',
					},
					commands,
					201,
				),
		}),
	);

	app.post(
		'/foundation/regions',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx }) =>
				createRegionCommand({
					...ctx,
					regionId: readText(payload.id) ?? '',
					regionFolderId: readNullableText(payload.regionFolderId),
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
					metadata: payload.metadata ?? null,
					geometry: payload.geometry,
				}),
			run: (context, commands) =>
				runCommands(
					context,
					{
						db: options.db,
						write: writeRegionCommand,
						notFound: 'region_not_found',
						key: 'region',
					},
					commands,
					201,
				),
		}),
	);

	app.post(
		'/foundation/organization-species',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx }) =>
				selectOrganizationSpeciesCommand({
					...ctx,
					organizationSpeciesId: readText(payload.id) ?? '',
					speciesId: readText(payload.speciesId) ?? '',
				}),
			run: (context, commands) =>
				runCommands(
					context,
					{
						db: options.db,
						write: writeOrganizationSpeciesCommand,
						notFound: 'organization_species_not_found',
						key: 'organizationSpecies',
					},
					commands,
					201,
				),
		}),
	);
}

function registerTrapSeed(
	app: Hono<{ Variables: AuthVariables }>,
	options: SeedRouteOptions,
): void {
	app.post(
		'/adult-surveillance/traps',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx }) =>
				createTrapCommand({
					...ctx,
					trapId: readText(payload.id) ?? '',
					locationSource: payload.locationSource as TrapLocationSourceInput,
					collectionMethodId: readText(payload.collectionMethodId) ?? '',
					addressId: readNullableText(payload.addressId),
					collectionLureId: readNullableText(payload.collectionLureId),
					trapName: readNullableText(payload.trapName),
					trapCode: readNullableText(payload.trapCode),
					description: readNullableText(payload.description),
					acknowledgedDuplicateTrapCode: acknowledged(payload, 'acknowledgedDuplicateTrapCode'),
				}),
			run: (context, commands) =>
				runCommands(
					context,
					{ db: options.db, write: writeTrapCommand, notFound: 'trap_not_found', key: 'trap' },
					commands,
					201,
				),
		}),
	);
}
