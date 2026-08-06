import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type CreateNotificationTypeCommand,
	createNotificationTypeCommand,
	type DeactivateNotificationTypeCommand,
	type DeleteNotificationTypeCommand,
	DomainValidationError,
	deactivateNotificationTypeCommand,
	deleteNotificationTypeCommand,
	type ReactivateNotificationTypeCommand,
	reactivateNotificationTypeCommand,
	type UpdateNotificationTypeCommand,
	updateNotificationTypeCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';
import { denyUnauthorizedAgencyCommands } from './command-permissions.js';

type PublicEngagementDb = Kysely<SimmerDatabase>;
type PublicEngagementTransaction = Transaction<SimmerDatabase>;
type NotificationTypeCommand =
	| CreateNotificationTypeCommand
	| UpdateNotificationTypeCommand
	| DeactivateNotificationTypeCommand
	| ReactivateNotificationTypeCommand
	| DeleteNotificationTypeCommand;

interface SafeNotificationType {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function registerPublicEngagementCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: PublicEngagementDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/public-engagement/notification-types',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readNotificationTypePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandResult = createCommand(() =>
				createNotificationTypeCommand({
					...agencyCommandContext(context.get('authContext')),
					notificationTypeId: payloadResult.payload.id,
					name: payloadResult.payload.name ?? '',
					...(payloadResult.payload.description === undefined
						? {}
						: { description: payloadResult.payload.description }),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
			if (denial !== null) {
				return denial;
			}

			const result = await writeNotificationTypeCommands(options.db, [commandResult.command]);
			return context.json(
				{ notificationType: toNotificationTypeResponse(result.row), txid: result.txid },
				201,
			);
		},
	);

	app.patch(
		'/public-engagement/notification-types/:notificationTypeId',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readNotificationTypePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandsResult = buildUpdateCommands(
				context.get('authContext'),
				context.req.param('notificationTypeId'),
				payloadResult.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, commandsResult.commands);
			if (denial !== null) {
				return denial;
			}

			const result = await writeNotificationTypeCommands(options.db, commandsResult.commands);
			if (result.row === null) {
				return context.json({ error: 'notification_type_not_found' }, 404);
			}

			return context.json({
				notificationType: toNotificationTypeResponse(result.row),
				txid: result.txid,
			});
		},
	);

	app.delete(
		'/public-engagement/notification-types/:notificationTypeId',
		options.authContextMiddleware,
		async (context) => {
			const commandResult = createCommand(() =>
				deleteNotificationTypeCommand({
					...agencyCommandContext(context.get('authContext')),
					notificationTypeId: context.req.param('notificationTypeId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
			if (denial !== null) {
				return denial;
			}

			const result = await writeNotificationTypeCommands(options.db, [commandResult.command]);
			if (result.row === null) {
				return context.json({ error: 'notification_type_not_found' }, 404);
			}

			return context.json({
				notificationType: toNotificationTypeResponse(result.row),
				txid: result.txid,
			});
		},
	);
}

async function writeNotificationTypeCommands(
	db: PublicEngagementDb,
	commands: readonly NotificationTypeCommand[],
): Promise<MutationWriteResult<SafeNotificationType | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeNotificationType | null = null;
		for (const command of commands) {
			row = await writeNotificationTypeCommand(trx, command);
		}
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

async function writeNotificationTypeCommand(
	db: PublicEngagementTransaction,
	command: NotificationTypeCommand,
): Promise<SafeNotificationType | null> {
	switch (command.type) {
		case 'publicEngagement.createNotificationType':
			return createNotificationType(db, {
				id: command.payload.notificationTypeId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				description: command.payload.description,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'publicEngagement.updateNotificationType':
			return updateNotificationType(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'publicEngagement.deactivateNotificationType':
			return setNotificationTypeActive(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'publicEngagement.reactivateNotificationType':
			return setNotificationTypeActive(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'publicEngagement.deleteNotificationType':
			return deleteNotificationType(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

interface NotificationTypeWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface NotificationTypeUpdateInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly actorProfileId: string;
}

interface NotificationTypeLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

async function createNotificationType(
	db: PublicEngagementTransaction,
	input: NotificationTypeWriteInput,
): Promise<SafeNotificationType> {
	const row = await db
		.insertInto('notification_types')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			name: input.name,
			description: input.description,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(notificationTypeReturnColumns)
		.executeTakeFirstOrThrow();

	return toSafeNotificationType(row);
}

async function updateNotificationType(
	db: PublicEngagementTransaction,
	notificationTypeId: string,
	input: NotificationTypeUpdateInput,
): Promise<SafeNotificationType | null> {
	const row = await db
		.updateTable('notification_types')
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.description === undefined ? {} : { description: input.description }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', notificationTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(notificationTypeReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeNotificationType(row);
}

async function setNotificationTypeActive(
	db: PublicEngagementTransaction,
	notificationTypeId: string,
	input: NotificationTypeLifecycleInput & { readonly isActive: boolean },
): Promise<SafeNotificationType | null> {
	const row = await db
		.updateTable('notification_types')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', notificationTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(notificationTypeReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeNotificationType(row);
}

async function deleteNotificationType(
	db: PublicEngagementTransaction,
	notificationTypeId: string,
	input: NotificationTypeLifecycleInput,
): Promise<SafeNotificationType | null> {
	const row = await db
		.updateTable('notification_types')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', notificationTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(notificationTypeReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeNotificationType(row);
}

function buildUpdateCommands(
	authContext: AuthContext,
	notificationTypeId: string,
	payload: NotificationTypePayload,
):
	| { readonly ok: true; readonly commands: readonly NotificationTypeCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: NotificationTypeCommand[] = [];
	const context = agencyCommandContext(authContext);
	const hasDetailChange = payload.name !== undefined || payload.description !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateNotificationTypeCommand({
				...context,
				notificationTypeId,
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
				? reactivateNotificationTypeCommand({ ...context, notificationTypeId })
				: deactivateNotificationTypeCommand({
						...context,
						notificationTypeId,
						acknowledgedActiveSubscriptionImpact: true,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdateCommand('notification type');
	}

	return { ok: true, commands };
}

function createCommand<TCommand extends NotificationTypeCommand>(
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

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

interface NotificationTypePayload {
	readonly id: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly isActive?: boolean;
}

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readNotificationTypePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<NotificationTypePayload>> {
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
			id: readRequiredText(raw.id) ?? '',
			...(raw.name === undefined ? {} : { name: readRequiredText(raw.name) ?? '' }),
			...(raw.description === undefined ? {} : { description: readOptionalText(raw.description) }),
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
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalText(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
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

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

async function readCurrentTransactionId(db: PublicEngagementTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
}

const notificationTypeReturnColumns = [
	'id',
	'organization_id',
	'name',
	'description',
	'is_active',
	'created_at',
	'updated_at',
] as const;

function toSafeNotificationType(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly description: string | null;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeNotificationType {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: row.description,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toNotificationTypeResponse(row: SafeNotificationType | null) {
	if (row === null) {
		return null;
	}

	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
