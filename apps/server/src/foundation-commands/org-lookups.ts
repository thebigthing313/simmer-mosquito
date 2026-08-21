/**
 * The three org-scoped lookup catalogs: collection methods, collection lures,
 * habitat types.
 *
 * They were three files of the same nine routes, differing in six strings and
 * three builders. Everything else — the payload read, the domain build, the
 * role check, the write, the 404 named after the entity — was identical, and
 * was written out nine times.
 *
 * They all write through the same per-command writer, so what is left once that
 * is factored out is a table.
 */

import {
	createCollectionLureCommand,
	createCollectionMethodCommand,
	createHabitatTypeCommand,
	deleteCollectionLureCommand,
	deleteCollectionMethodCommand,
	deleteHabitatTypeCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import {
	type AgencyContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
} from '../command-endpoint.js';
import { runCommands } from '../command-write.js';
import {
	buildCollectionLureUpdateCommands,
	buildHabitatTypeUpdateCommands,
	buildUpdateCommands,
	type CollectionMethodCreatePayload,
	type CollectionMethodUpdatePayload,
	type FoundationCommandDb,
	type LookupCommand,
	type LookupCommandWriter,
	readCollectionMethodCreatePayload,
	readCollectionMethodUpdatePayload,
} from './shared.js';

/** What one catalog differs by. */
interface OrgLookupCatalog {
	/** The path segment under `/foundation/`. */
	readonly path: string;
	/** The `:id` parameter name, e.g. `collectionLureId`. */
	readonly idParam: string;
	/** The response key the row comes back under. */
	readonly key: string;
	/** The 404 body's `error`. */
	readonly notFound: string;
	readonly create: (agency: AgencyContext, payload: CollectionMethodCreatePayload) => LookupCommand;
	readonly update: (
		authContext: AuthContext,
		id: string,
		payload: CollectionMethodUpdatePayload,
	) => CommandsResult<LookupCommand>;
	readonly remove: (agency: AgencyContext, id: string) => LookupCommand;
}

const orgLookupCatalogs: readonly OrgLookupCatalog[] = [
	{
		path: 'collection-methods',
		idParam: 'collectionMethodId',
		key: 'collectionMethod',
		notFound: 'collection_method_not_found',
		create: (agency, payload) =>
			createCollectionMethodCommand({
				...agency,
				collectionMethodId: payload.id,
				name: payload.name,
				description: payload.description,
				customSchema: payload.customSchema,
				actionThreshold: payload.actionThreshold,
			}),
		update: buildUpdateCommands,
		remove: (agency, collectionMethodId) =>
			deleteCollectionMethodCommand({ ...agency, collectionMethodId }),
	},
	{
		path: 'collection-lures',
		idParam: 'collectionLureId',
		key: 'collectionLure',
		notFound: 'collection_lure_not_found',
		create: (agency, payload) =>
			createCollectionLureCommand({
				...agency,
				collectionLureId: payload.id,
				name: payload.name,
				description: payload.description,
			}),
		update: buildCollectionLureUpdateCommands,
		remove: (agency, collectionLureId) =>
			deleteCollectionLureCommand({ ...agency, collectionLureId }),
	},
	{
		path: 'habitat-types',
		idParam: 'habitatTypeId',
		key: 'habitatType',
		notFound: 'habitat_type_not_found',
		create: (agency, payload) =>
			createHabitatTypeCommand({
				...agency,
				habitatTypeId: payload.id,
				name: payload.name,
				description: payload.description,
				customSchema: payload.customSchema,
			}),
		update: buildHabitatTypeUpdateCommands,
		remove: (agency, habitatTypeId) => deleteHabitatTypeCommand({ ...agency, habitatTypeId }),
	},
];

export function registerOrgLookupRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	writeLookupCommand: LookupCommandWriter,
): void {
	for (const catalog of orgLookupCatalogs) {
		const run = (
			context: CommandContext,
			commands: readonly LookupCommand[],
			createdStatus?: 201,
		) =>
			runCommands(
				context,
				{
					db: options.db,
					write: writeLookupCommand,
					notFound: catalog.notFound,
					key: catalog.key,
				},
				commands,
				createdStatus,
			);

		app.post(
			`/foundation/${catalog.path}`,
			options.authContextMiddleware,
			commandEndpoint({
				readPayload: readCollectionMethodCreatePayload,
				build: ({ payload, agency }) => catalog.create(agency, payload),
				run: (context, commands) => run(context, commands, 201),
			}),
		);

		app.patch(
			`/foundation/${catalog.path}/:${catalog.idParam}`,
			options.authContextMiddleware,
			commandEndpoint({
				readPayload: readCollectionMethodUpdatePayload,
				build: ({ payload, authContext, param }) =>
					catalog.update(authContext, param(catalog.idParam), payload),
				run,
			}),
		);

		app.delete(
			`/foundation/${catalog.path}/:${catalog.idParam}`,
			options.authContextMiddleware,
			commandEndpoint({
				body: 'none',
				build: ({ agency, param }) => catalog.remove(agency, param(catalog.idParam)),
				run,
			}),
		);
	}
}
