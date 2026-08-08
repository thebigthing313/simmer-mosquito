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
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	type PayloadResult,
} from './command-endpoint.js';
import { isRecord } from './command-payload.js';
import { runCommands } from './command-write.js';

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
	const run = (
		context: CommandContext,
		commands: readonly NotificationTypeCommand[],
		createdStatus?: 201,
	) =>
		runCommands(
			context,
			{
				db: options.db,
				write: async (trx, command) =>
					toNotificationTypeResponse(await writeNotificationTypeCommand(trx, command)),
				notFound: 'notification_type_not_found',
				key: 'notificationType',
			},
			commands,
			createdStatus,
		);

	app.post(
		'/public-engagement/notification-types',
		options.authContextMiddleware,
		commandEndpoint({
			readPayload: readNotificationTypePayload,
			build: ({ payload, agency }) =>
				createNotificationTypeCommand({
					...agency,
					notificationTypeId: payload.id,
					name: payload.name ?? '',
					...(payload.description === undefined ? {} : { description: payload.description }),
				}),
			run: (context, commands) => run(context, commands, 201),
		}),
	);

	app.patch(
		'/public-engagement/notification-types/:notificationTypeId',
		options.authContextMiddleware,
		commandEndpoint({
			readPayload: readNotificationTypePayload,
			build: ({ payload, authContext, param }) =>
				buildUpdateCommands(authContext, param('notificationTypeId'), payload),
			run,
		}),
	);

	app.delete(
		'/public-engagement/notification-types/:notificationTypeId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency, param }) =>
				deleteNotificationTypeCommand({
					...agency,
					notificationTypeId: param('notificationTypeId'),
				}),
			run,
		}),
	);
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
): CommandsResult<NotificationTypeCommand> {
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
		return invalidUpdate('notification type');
	}

	return { ok: true, commands };
}

interface NotificationTypePayload {
	readonly id: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly isActive?: boolean;
}

function readNotificationTypePayload(
	raw: Record<string, unknown>,
): PayloadResult<NotificationTypePayload> {
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalidPayload('isActive must be a boolean.');
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

function invalidPayload(reason: string): PayloadResult<never> {
	return { ok: false, reason };
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
