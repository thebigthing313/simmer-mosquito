import {
	createOrgLookup,
	createTag,
	deleteCollectionLureLookup,
	deleteCollectionMethodLookup,
	deleteHabitatTypeLookup,
	deleteTag,
	type MutationWriteResult,
	type SafeOrgLookup,
	type SafeTag,
	setCollectionLureLookupActive,
	setCollectionMethodLookupActive,
	setHabitatTypeLookupActive,
	setTagActive,
	updateCollectionLureLookup,
	updateCollectionMethodLookup,
	updateHabitatTypeLookup,
	updateTag,
	writeCollectionMethodLookupCommandsWithTxid,
	writeTagCommandsWithTxid,
} from '@simmer-mosquito/db';
import {
	activateTagCommand,
	type CreateCollectionLureCommand,
	type CreateCollectionMethodCommand,
	type CreateHabitatTypeCommand,
	createTagCommand,
	type DeactivateCollectionLureCommand,
	type DeactivateCollectionMethodCommand,
	type DeactivateHabitatTypeCommand,
	type DeleteCollectionLureCommand,
	type DeleteCollectionMethodCommand,
	type DeleteHabitatTypeCommand,
	deactivateTagCommand,
	deleteTagCommand,
	type ReactivateCollectionLureCommand,
	type ReactivateCollectionMethodCommand,
	type ReactivateHabitatTypeCommand,
	type UpdateCollectionLureCommand,
	type UpdateCollectionMethodCommand,
	type UpdateHabitatTypeCommand,
	updateTagCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { authorizeCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	createCommand,
	type FoundationCommandDb,
	type InvalidCommandBody,
	invalid,
	invalidUpdateCommand,
	type LookupCommand,
	type PayloadResult,
	readJsonObject,
	readOptionalText,
	readRequiredText,
	type TagCommand,
	type TagCommandWriter,
} from './shared.js';

// --------------------------------------------------------------------------
// Tags
// --------------------------------------------------------------------------

/**
 * The role check the tag catalog runs before writing.
 *
 * `fieldWork.createTag` and friends are field-work commands answered by a
 * foundation endpoint, so they are named in the same permission map the
 * `/field-work/*` routes read — but this module funnels through its own writer
 * and would otherwise never consult it. "Tag catalog management is
 * manager-and-above" (`docs/field-work-support-domain.md`).
 */
function denyUnauthorizedTagCommands(
	context: Context<{ Variables: AuthVariables }>,
	commands: readonly TagCommand[],
): Response | null {
	const denial = authorizeCommands(context.get('authContext').role, commands);
	return denial === null ? null : context.json(denial, 403);
}

export function registerTagRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
	writeTagCommands: TagCommandWriter,
): void {
	app.post('/foundation/tags', options.authContextMiddleware, async (context) => {
		const payloadResult = await readTagCreatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandResult = createCommand(() =>
			createTagCommand({
				...agencyCommandContext(context.get('authContext')),
				tagId: payloadResult.payload.id,
				tagName: payloadResult.payload.tagName,
				description: payloadResult.payload.description,
				color: payloadResult.payload.color,
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedTagCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeTagCommands(options.db, [commandResult.command]);
		return context.json({ tag: toTagResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/foundation/tags/:tagId', options.authContextMiddleware, async (context) => {
		const payloadResult = await readTagUpdatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandsResult = buildTagUpdateCommands(
			context.get('authContext'),
			context.req.param('tagId'),
			payloadResult.payload,
		);
		if (!commandsResult.ok) {
			return context.json(commandsResult.body, 400);
		}

		const denial = denyUnauthorizedTagCommands(context, commandsResult.commands);
		if (denial !== null) {
			return denial;
		}

		const result = await writeTagCommands(options.db, commandsResult.commands);
		if (result.row === null) {
			return context.json({ error: 'tag_not_found' }, 404);
		}

		return context.json({ tag: toTagResponse(result.row), txid: result.txid });
	});

	app.delete('/foundation/tags/:tagId', options.authContextMiddleware, async (context) => {
		const commandResult = createCommand(() =>
			deleteTagCommand({
				...agencyCommandContext(context.get('authContext')),
				tagId: context.req.param('tagId'),
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedTagCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeTagCommands(options.db, [commandResult.command]);
		if (result.row === null) {
			return context.json({ error: 'tag_not_found' }, 404);
		}

		return context.json({ tag: toTagResponse(result.row), txid: result.txid });
	});
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

export async function writeFoundationTagCommands(
	db: FoundationCommandDb,
	commands: readonly TagCommand[],
): Promise<MutationWriteResult<SafeTag | null>> {
	return writeTagCommandsWithTxid(db, async (trx) => {
		let row: SafeTag | null = null;
		for (const command of commands) {
			row = await writeFoundationTagCommand(trx, command);
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

async function writeFoundationTagCommand(
	db: Parameters<Parameters<typeof writeTagCommandsWithTxid>[1]>[0],
	command: TagCommand,
): Promise<SafeTag | null> {
	switch (command.type) {
		case 'fieldWork.createTag': {
			const payload = command.payload;
			return createTag(db, {
				id: payload.tagId,
				organizationId: payload.organizationId,
				tagName: payload.tagName,
				description: payload.description,
				color: payload.color,
				isActive: true,
				createdByProfileId: payload.actorProfileId,
				updatedByProfileId: payload.actorProfileId,
			});
		}
		case 'fieldWork.updateTag': {
			const payload = command.payload;
			return updateTag(db, payload.tagId, {
				organizationId: payload.organizationId,
				...payload.changes,
				updatedByProfileId: payload.actorProfileId,
			});
		}
		case 'fieldWork.activateTag': {
			const payload = command.payload;
			return setTagActive(db, payload.tagId, {
				organizationId: payload.organizationId,
				actorProfileId: payload.actorProfileId,
				isActive: true,
			});
		}
		case 'fieldWork.deactivateTag': {
			const payload = command.payload;
			return setTagActive(db, payload.tagId, {
				organizationId: payload.organizationId,
				actorProfileId: payload.actorProfileId,
				isActive: false,
			});
		}
		case 'fieldWork.deleteTag': {
			const payload = command.payload;
			return deleteTag(db, payload.tagId, {
				organizationId: payload.organizationId,
				actorProfileId: payload.actorProfileId,
			});
		}
	}
}

function buildTagUpdateCommands(
	authContext: AuthContext,
	tagId: string,
	payload: TagUpdatePayload,
):
	| { readonly ok: true; readonly commands: readonly TagCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: TagCommand[] = [];
	const hasDetailChange =
		payload.tagName !== undefined ||
		payload.description !== undefined ||
		payload.color !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateTagCommand({
				...agencyCommandContext(authContext),
				tagId,
				...(payload.tagName === undefined ? {} : { tagName: payload.tagName }),
				...(payload.description === undefined ? {} : { description: payload.description }),
				...(payload.color === undefined ? {} : { color: payload.color }),
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
				? activateTagCommand({
						...agencyCommandContext(authContext),
						tagId,
					})
				: deactivateTagCommand({
						...agencyCommandContext(authContext),
						tagId,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdateCommand('tag');
	}

	return { ok: true, commands };
}

interface TagCreatePayload {
	readonly id: string;
	readonly tagName: string;
	readonly description: string | null;
	readonly color: string | null;
}

interface TagUpdatePayload {
	readonly tagName?: string;
	readonly description?: string | null;
	readonly color?: string | null;
	readonly isActive?: boolean;
}

async function readTagCreatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<TagCreatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const id = readRequiredText(raw.id);
	const tagName = readRequiredText(raw.tagName);
	if (id === null || tagName === null) {
		return invalid('id and tagName are required.');
	}

	return {
		ok: true,
		payload: {
			id,
			tagName,
			description: readOptionalText(raw.description),
			color: readOptionalText(raw.color),
		},
	};
}

async function readTagUpdatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<TagUpdatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalid('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			...(raw.tagName === undefined ? {} : { tagName: readRequiredText(raw.tagName) ?? '' }),
			...(raw.description === undefined ? {} : { description: readOptionalText(raw.description) }),
			...(raw.color === undefined ? {} : { color: readOptionalText(raw.color) }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
		},
	};
}

function toTagResponse(row: SafeTag | null) {
	if (row === null) {
		return null;
	}

	return {
		id: row.id,
		organizationId: row.organizationId,
		tagName: row.tagName,
		description: row.description,
		color: row.color,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
