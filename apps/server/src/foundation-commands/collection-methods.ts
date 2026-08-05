import {
	createCollectionMethodCommand,
	deleteCollectionMethodCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	buildUpdateCommands,
	type CollectionMethodCommandWriter,
	createCommand,
	type FoundationCommandDb,
	readCollectionMethodCreatePayload,
	readCollectionMethodUpdatePayload,
	toCollectionMethodResponse,
} from './shared.js';

// --------------------------------------------------------------------------
// Collection methods
// --------------------------------------------------------------------------

export function registerCollectionMethodRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	writeCollectionMethodCommands: CollectionMethodCommandWriter,
): void {
	app.post('/foundation/collection-methods', options.authContextMiddleware, async (context) => {
		const payloadResult = await readCollectionMethodCreatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const commandResult = createCommand(() =>
			createCollectionMethodCommand({
				...agencyCommandContext(authContext),
				collectionMethodId: payloadResult.payload.id,
				name: payloadResult.payload.name,
				description: payloadResult.payload.description,
				customSchema: payloadResult.payload.customSchema,
				actionThreshold: payloadResult.payload.actionThreshold,
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
			{ collectionMethod: toCollectionMethodResponse(result.row), txid: result.txid },
			201,
		);
	});

	app.patch(
		'/foundation/collection-methods/:collectionMethodId',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readCollectionMethodUpdatePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const authContext = context.get('authContext');
			const collectionMethodId = context.req.param('collectionMethodId');
			const commandsResult = buildUpdateCommands(
				authContext,
				collectionMethodId,
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
				return context.json({ error: 'collection_method_not_found' }, 404);
			}

			return context.json({
				collectionMethod: toCollectionMethodResponse(result.row),
				txid: result.txid,
			});
		},
	);

	app.delete(
		'/foundation/collection-methods/:collectionMethodId',
		options.authContextMiddleware,
		async (context) => {
			const authContext = context.get('authContext');
			const commandResult = createCommand(() =>
				deleteCollectionMethodCommand({
					...agencyCommandContext(authContext),
					collectionMethodId: context.req.param('collectionMethodId'),
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
				return context.json({ error: 'collection_method_not_found' }, 404);
			}

			return context.json({
				collectionMethod: toCollectionMethodResponse(result.row),
				txid: result.txid,
			});
		},
	);
}
