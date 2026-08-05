import { createHabitatTypeCommand, deleteHabitatTypeCommand } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	buildHabitatTypeUpdateCommands,
	type CollectionMethodCommandWriter,
	createCommand,
	type FoundationCommandDb,
	readCollectionMethodCreatePayload,
	readCollectionMethodUpdatePayload,
	toCollectionMethodResponse,
} from './shared.js';

// --------------------------------------------------------------------------
// Habitat types
// --------------------------------------------------------------------------

export function registerHabitatTypeRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	writeCollectionMethodCommands: CollectionMethodCommandWriter,
): void {
	app.post('/foundation/habitat-types', options.authContextMiddleware, async (context) => {
		const payloadResult = await readCollectionMethodCreatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const commandResult = createCommand(() =>
			createHabitatTypeCommand({
				...agencyCommandContext(authContext),
				habitatTypeId: payloadResult.payload.id,
				name: payloadResult.payload.name,
				description: payloadResult.payload.description,
				customSchema: payloadResult.payload.customSchema,
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeCollectionMethodCommands(options.db, [commandResult.command]);
		return context.json(
			{ habitatType: toCollectionMethodResponse(result.row), txid: result.txid },
			201,
		);
	});

	app.patch(
		'/foundation/habitat-types/:habitatTypeId',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readCollectionMethodUpdatePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandsResult = buildHabitatTypeUpdateCommands(
				context.get('authContext'),
				context.req.param('habitatTypeId'),
				payloadResult.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, commandsResult.commands);
			if (denial !== null) {
				return denial;
			}

			const result = await writeCollectionMethodCommands(options.db, commandsResult.commands);
			if (result.row === null) {
				return context.json({ error: 'habitat_type_not_found' }, 404);
			}

			return context.json({
				habitatType: toCollectionMethodResponse(result.row),
				txid: result.txid,
			});
		},
	);

	app.delete(
		'/foundation/habitat-types/:habitatTypeId',
		options.authContextMiddleware,
		async (context) => {
			const commandResult = createCommand(() =>
				deleteHabitatTypeCommand({
					...agencyCommandContext(context.get('authContext')),
					habitatTypeId: context.req.param('habitatTypeId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
			if (denial !== null) {
				return denial;
			}

			const result = await writeCollectionMethodCommands(options.db, [commandResult.command]);
			if (result.row === null) {
				return context.json({ error: 'habitat_type_not_found' }, 404);
			}

			return context.json({
				habitatType: toCollectionMethodResponse(result.row),
				txid: result.txid,
			});
		},
	);
}
