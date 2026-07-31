import { createCollectionLureCommand, deleteCollectionLureCommand } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	buildCollectionLureUpdateCommands,
	type CollectionMethodCommandWriter,
	createCommand,
	type FoundationCommandDb,
	readCollectionMethodCreatePayload,
	readCollectionMethodUpdatePayload,
	toCollectionMethodResponse,
} from './shared.js';

// --------------------------------------------------------------------------
// Collection lures
// --------------------------------------------------------------------------

export function registerCollectionLureRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	writeCollectionMethodCommands: CollectionMethodCommandWriter,
): void {
	app.post('/foundation/collection-lures', options.authContextMiddleware, async (context) => {
		const payloadResult = await readCollectionMethodCreatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const commandResult = createCommand(() =>
			createCollectionLureCommand({
				...agencyCommandContext(authContext),
				collectionLureId: payloadResult.payload.id,
				name: payloadResult.payload.name,
				description: payloadResult.payload.description,
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const result = await writeCollectionMethodCommands(options.db, [commandResult.command]);
		return context.json(
			{ collectionLure: toCollectionMethodResponse(result.row), txid: result.txid },
			201,
		);
	});

	app.patch(
		'/foundation/collection-lures/:collectionLureId',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readCollectionMethodUpdatePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandsResult = buildCollectionLureUpdateCommands(
				context.get('authContext'),
				context.req.param('collectionLureId'),
				payloadResult.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			const result = await writeCollectionMethodCommands(options.db, commandsResult.commands);
			if (result.row === null) {
				return context.json({ error: 'collection_lure_not_found' }, 404);
			}

			return context.json({
				collectionLure: toCollectionMethodResponse(result.row),
				txid: result.txid,
			});
		},
	);

	app.delete(
		'/foundation/collection-lures/:collectionLureId',
		options.authContextMiddleware,
		async (context) => {
			const commandResult = createCommand(() =>
				deleteCollectionLureCommand({
					...agencyCommandContext(context.get('authContext')),
					collectionLureId: context.req.param('collectionLureId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const result = await writeCollectionMethodCommands(options.db, [commandResult.command]);
			if (result.row === null) {
				return context.json({ error: 'collection_lure_not_found' }, 404);
			}

			return context.json({
				collectionLure: toCollectionMethodResponse(result.row),
				txid: result.txid,
			});
		},
	);
}
