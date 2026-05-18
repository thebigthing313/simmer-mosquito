import {
	createOrgLookup,
	deleteCollectionLureLookup,
	deleteCollectionMethodLookup,
	deleteHabitatTypeLookup,
	type MutationWriteResult,
	type SafeOrgLookup,
	setCollectionLureLookupActive,
	setCollectionMethodLookupActive,
	setHabitatTypeLookupActive,
	updateCollectionLureLookup,
	updateCollectionMethodLookup,
	updateHabitatTypeLookup,
	writeCollectionMethodLookupCommandsWithTxid,
} from '@simmer-mosquito/db';
import {
	type CreateCollectionLureCommand,
	type CreateCollectionMethodCommand,
	type CreateHabitatTypeCommand,
	createCollectionLureCommand,
	createCollectionMethodCommand,
	createHabitatTypeCommand,
	type DeactivateCollectionLureCommand,
	type DeactivateCollectionMethodCommand,
	type DeactivateHabitatTypeCommand,
	type DeleteCollectionLureCommand,
	type DeleteCollectionMethodCommand,
	type DeleteHabitatTypeCommand,
	DomainValidationError,
	deactivateCollectionLureCommand,
	deactivateCollectionMethodCommand,
	deactivateHabitatTypeCommand,
	deleteCollectionLureCommand,
	deleteCollectionMethodCommand,
	deleteHabitatTypeCommand,
	type ReactivateCollectionLureCommand,
	type ReactivateCollectionMethodCommand,
	type ReactivateHabitatTypeCommand,
	reactivateCollectionLureCommand,
	reactivateCollectionMethodCommand,
	reactivateHabitatTypeCommand,
	type UpdateCollectionLureCommand,
	type UpdateCollectionMethodCommand,
	type UpdateHabitatTypeCommand,
	updateCollectionLureCommand,
	updateCollectionMethodCommand,
	updateHabitatTypeCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type FoundationCommandDb = Parameters<typeof writeCollectionMethodLookupCommandsWithTxid>[0];
type CollectionMethodCommand =
	| CreateCollectionMethodCommand
	| UpdateCollectionMethodCommand
	| DeactivateCollectionMethodCommand
	| ReactivateCollectionMethodCommand
	| DeleteCollectionMethodCommand;
type CollectionLureCommand =
	| CreateCollectionLureCommand
	| UpdateCollectionLureCommand
	| DeactivateCollectionLureCommand
	| ReactivateCollectionLureCommand
	| DeleteCollectionLureCommand;
type HabitatTypeCommand =
	| CreateHabitatTypeCommand
	| UpdateHabitatTypeCommand
	| DeactivateHabitatTypeCommand
	| ReactivateHabitatTypeCommand
	| DeleteHabitatTypeCommand;
type LookupCommand = CollectionMethodCommand | CollectionLureCommand | HabitatTypeCommand;

type CollectionMethodCommandWriter = (
	db: FoundationCommandDb,
	commands: readonly LookupCommand[],
) => Promise<MutationWriteResult<SafeOrgLookup | null>>;

export function registerFoundationCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly writeCollectionMethodCommands?: CollectionMethodCommandWriter;
	},
): void {
	const writeCollectionMethodCommands =
		options.writeCollectionMethodCommands ?? writeFoundationLookupCommands;

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

export async function writeFoundationLookupCommands(
	db: FoundationCommandDb,
	commands: readonly LookupCommand[],
): Promise<MutationWriteResult<SafeOrgLookup | null>> {
	return writeCollectionMethodLookupCommandsWithTxid(db, async (trx) => {
		let row: SafeOrgLookup | null = null;
		for (const command of commands) {
			row = await writeFoundationLookupCommand(trx, command);
		}

		return row;
	});
}

async function writeFoundationLookupCommand(
	db: Parameters<Parameters<typeof writeCollectionMethodLookupCommandsWithTxid>[1]>[0],
	command: LookupCommand,
): Promise<SafeOrgLookup | null> {
	switch (command.type) {
		case 'foundation.createCollectionMethod': {
			const createPayload = (command as CreateCollectionMethodCommand).payload;
			return createOrgLookup(db, 'collection_methods', {
				id: createPayload.collectionMethodId,
				organizationId: createPayload.organizationId,
				name: createPayload.name,
				description: createPayload.description,
				customSchema: createPayload.customSchema,
				actionThreshold: createPayload.actionThreshold,
				isActive: true,
				createdByProfileId: createPayload.actorProfileId,
				updatedByProfileId: createPayload.actorProfileId,
			});
		}
		case 'foundation.updateCollectionMethod': {
			const updatePayload = (command as UpdateCollectionMethodCommand).payload;
			return updateCollectionMethodLookup(db, updatePayload.collectionMethodId, {
				organizationId: updatePayload.organizationId,
				...updatePayload.changes,
				updatedByProfileId: updatePayload.actorProfileId,
			});
		}
		case 'foundation.deactivateCollectionMethod': {
			const lifecyclePayload = (command as DeactivateCollectionMethodCommand).payload;
			return setCollectionMethodLookupActive(db, lifecyclePayload.collectionMethodId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: false,
			});
		}
		case 'foundation.reactivateCollectionMethod': {
			const lifecyclePayload = (command as ReactivateCollectionMethodCommand).payload;
			return setCollectionMethodLookupActive(db, lifecyclePayload.collectionMethodId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: true,
			});
		}
		case 'foundation.deleteCollectionMethod': {
			const lifecyclePayload = (command as DeleteCollectionMethodCommand).payload;
			return deleteCollectionMethodLookup(db, lifecyclePayload.collectionMethodId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
			});
		}
		case 'foundation.createCollectionLure': {
			const createPayload = (command as CreateCollectionLureCommand).payload;
			return createOrgLookup(db, 'collection_lures', {
				id: createPayload.collectionLureId,
				organizationId: createPayload.organizationId,
				name: createPayload.name,
				description: createPayload.description,
				isActive: true,
				createdByProfileId: createPayload.actorProfileId,
				updatedByProfileId: createPayload.actorProfileId,
			});
		}
		case 'foundation.updateCollectionLure': {
			const updatePayload = (command as UpdateCollectionLureCommand).payload;
			return updateCollectionLureLookup(db, updatePayload.collectionLureId, {
				organizationId: updatePayload.organizationId,
				...updatePayload.changes,
				updatedByProfileId: updatePayload.actorProfileId,
			});
		}
		case 'foundation.deactivateCollectionLure': {
			const lifecyclePayload = (command as DeactivateCollectionLureCommand).payload;
			return setCollectionLureLookupActive(db, lifecyclePayload.collectionLureId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: false,
			});
		}
		case 'foundation.reactivateCollectionLure': {
			const lifecyclePayload = (command as ReactivateCollectionLureCommand).payload;
			return setCollectionLureLookupActive(db, lifecyclePayload.collectionLureId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: true,
			});
		}
		case 'foundation.deleteCollectionLure': {
			const lifecyclePayload = (command as DeleteCollectionLureCommand).payload;
			return deleteCollectionLureLookup(db, lifecyclePayload.collectionLureId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
			});
		}
		case 'foundation.createHabitatType': {
			const createPayload = (command as CreateHabitatTypeCommand).payload;
			return createOrgLookup(db, 'habitat_types', {
				id: createPayload.habitatTypeId,
				organizationId: createPayload.organizationId,
				name: createPayload.name,
				description: createPayload.description,
				customSchema: createPayload.customSchema,
				isActive: true,
				createdByProfileId: createPayload.actorProfileId,
				updatedByProfileId: createPayload.actorProfileId,
			});
		}
		case 'foundation.updateHabitatType': {
			const updatePayload = (command as UpdateHabitatTypeCommand).payload;
			return updateHabitatTypeLookup(db, updatePayload.habitatTypeId, {
				organizationId: updatePayload.organizationId,
				...updatePayload.changes,
				updatedByProfileId: updatePayload.actorProfileId,
			});
		}
		case 'foundation.deactivateHabitatType': {
			const lifecyclePayload = (command as DeactivateHabitatTypeCommand).payload;
			return setHabitatTypeLookupActive(db, lifecyclePayload.habitatTypeId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: false,
			});
		}
		case 'foundation.reactivateHabitatType': {
			const lifecyclePayload = (command as ReactivateHabitatTypeCommand).payload;
			return setHabitatTypeLookupActive(db, lifecyclePayload.habitatTypeId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: true,
			});
		}
		case 'foundation.deleteHabitatType': {
			const lifecyclePayload = (command as DeleteHabitatTypeCommand).payload;
			return deleteHabitatTypeLookup(db, lifecyclePayload.habitatTypeId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
			});
		}
	}
}

function buildUpdateCommands(
	authContext: AuthContext,
	collectionMethodId: string,
	payload: CollectionMethodUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly CollectionMethodCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: CollectionMethodCommand[] = [];
	const hasDetailChange =
		payload.name !== undefined ||
		payload.description !== undefined ||
		payload.customSchema !== undefined ||
		payload.actionThreshold !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateCollectionMethodCommand({
				...agencyCommandContext(authContext),
				collectionMethodId,
				...(payload.name === undefined ? {} : { name: payload.name }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				...(payload.customSchema === undefined ? {} : { customSchema: payload.customSchema }),
				...(payload.actionThreshold === undefined
					? {}
					: { actionThreshold: payload.actionThreshold }),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateCollectionMethodCommand({
						...agencyCommandContext(authContext),
						collectionMethodId,
					})
				: deactivateCollectionMethodCommand({
						...agencyCommandContext(authContext),
						collectionMethodId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return {
			ok: false,
			body: {
				error: 'invalid_command',
				message: 'At least one collection method field must change.',
				issues: [{ path: 'changes', message: 'At least one collection method field must change.' }],
			},
		};
	}

	return { ok: true, commands };
}

function buildCollectionLureUpdateCommands(
	authContext: AuthContext,
	collectionLureId: string,
	payload: CollectionMethodUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly CollectionLureCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: CollectionLureCommand[] = [];
	const hasDetailChange = payload.name !== undefined || payload.description !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateCollectionLureCommand({
				...agencyCommandContext(authContext),
				collectionLureId,
				...(payload.name === undefined ? {} : { name: payload.name }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateCollectionLureCommand({
						...agencyCommandContext(authContext),
						collectionLureId,
					})
				: deactivateCollectionLureCommand({
						...agencyCommandContext(authContext),
						collectionLureId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdateCommand('collection lure');
	}

	return { ok: true, commands };
}

function buildHabitatTypeUpdateCommands(
	authContext: AuthContext,
	habitatTypeId: string,
	payload: CollectionMethodUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly HabitatTypeCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: HabitatTypeCommand[] = [];
	const hasDetailChange =
		payload.name !== undefined ||
		payload.description !== undefined ||
		payload.customSchema !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateHabitatTypeCommand({
				...agencyCommandContext(authContext),
				habitatTypeId,
				...(payload.name === undefined ? {} : { name: payload.name }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				...(payload.customSchema === undefined ? {} : { customSchema: payload.customSchema }),
				acknowledgedHistoricalLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateHabitatTypeCommand({
						...agencyCommandContext(authContext),
						habitatTypeId,
					})
				: deactivateHabitatTypeCommand({
						...agencyCommandContext(authContext),
						habitatTypeId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdateCommand('habitat type');
	}

	return { ok: true, commands };
}

function invalidUpdateCommand(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: {
			error: 'invalid_command',
			message,
			issues: [{ path: 'changes', message }],
		},
	};
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

function createCommand<TCommand extends LookupCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: {
					error: 'invalid_command',
					message: error.message,
					issues: error.issues,
				},
			};
		}

		throw error;
	}
}

interface CollectionMethodCreatePayload {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly customSchema: unknown | null;
	readonly actionThreshold: number | null;
}

interface CollectionMethodUpdatePayload {
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly isActive?: boolean;
}

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readCollectionMethodCreatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<CollectionMethodCreatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const id = readRequiredText(raw.id);
	const name = readRequiredText(raw.name);
	const actionThreshold = readOptionalNonnegativeInteger(raw.actionThreshold);
	if (id === null || name === null) {
		return invalid('id and name are required.');
	}
	if (actionThreshold === undefined) {
		return invalid('actionThreshold must be a nonnegative integer.');
	}

	return {
		ok: true,
		payload: {
			id,
			name,
			description: readOptionalText(raw.description),
			customSchema: readOptionalJson(raw.customSchema),
			actionThreshold,
		},
	};
}

async function readCollectionMethodUpdatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<CollectionMethodUpdatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const actionThreshold = readOptionalNonnegativeInteger(raw.actionThreshold);
	if (actionThreshold === undefined) {
		return invalid('actionThreshold must be a nonnegative integer.');
	}
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalid('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			...(raw.name === undefined ? {} : { name: readRequiredText(raw.name) ?? '' }),
			...(raw.description === undefined ? {} : { description: readOptionalText(raw.description) }),
			...(raw.customSchema === undefined
				? {}
				: { customSchema: readOptionalJson(raw.customSchema) }),
			...(raw.actionThreshold === undefined ? {} : { actionThreshold }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
		},
	};
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return invalid('Request body must be JSON.');
	}

	if (!isRecord(raw)) {
		return invalid('Request body must be an object.');
	}

	return { ok: true, payload: raw };
}

function readRequiredText(value: unknown): string | null {
	return readOptionalText(value);
}

function readOptionalText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

function readOptionalNonnegativeInteger(value: unknown): number | null | undefined {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return undefined;
	}

	return value;
}

function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function toCollectionMethodResponse(row: SafeOrgLookup | null) {
	if (row === null) {
		return null;
	}

	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		customSchema: row.customSchema,
		actionThreshold: row.actionThreshold,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
