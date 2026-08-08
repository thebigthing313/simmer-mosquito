import {
	type PublicEngagementCommand,
	subscribeNotificationRegistrationTypeCommand,
	unsubscribeNotificationRegistrationTypeCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import {
	type CommandContext,
	commandEndpoint,
	insertRegistrationType,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	registrationTypeReturnColumns,
	runCommands,
	type SafeRegistrationType,
	softDelete,
	toSafeRegistrationType,
} from './shared.js';

// ===========================================================================
// Notification registration types (subscriptions)
// ===========================================================================

export function registerNotificationRegistrationTypeRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/public-engagement/notification-registration-types',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				subscribeNotificationRegistrationTypeCommand({
					...ctx,
					notificationRegistrationTypeId: readText(payload.id) ?? '',
					notificationRegistrationId: readText(payload.notificationRegistrationId) ?? '',
					notificationTypeId: readText(payload.notificationTypeId) ?? '',
				}),
			run: (context, commands) => runRegistrationTypeCommands(context, options.db, commands, 201),
		}),
	);

	app.delete(
		'/public-engagement/notification-registration-types/:notificationRegistrationTypeId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				unsubscribeNotificationRegistrationTypeCommand({
					...ctx,
					notificationRegistrationTypeId: param('notificationRegistrationTypeId'),
				}),
			run: (context, commands) => runRegistrationTypeCommands(context, options.db, commands),
		}),
	);
}

async function runRegistrationTypeCommands(
	context: CommandContext,
	db: PublicEngagementDb,
	commands: readonly PublicEngagementCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeRegistrationTypeCommand,
			notFound: 'notification_registration_type_not_found',
			key: 'notificationRegistrationType',
		},
		commands,
		createdStatus,
	);
}

async function writeRegistrationTypeCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<SafeRegistrationType | null> {
	switch (command.type) {
		case 'publicEngagement.subscribeNotificationRegistrationType':
			return insertRegistrationType(
				trx,
				command.payload.organizationId,
				command.payload.notificationRegistrationTypeId,
				command.payload.notificationRegistrationId,
				command.payload.notificationTypeId,
				command.payload.actorProfileId,
			);
		case 'publicEngagement.unsubscribeNotificationRegistrationType':
			return softDelete(
				trx,
				'notification_registration_types',
				command.payload.notificationRegistrationTypeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				registrationTypeReturnColumns,
				toSafeRegistrationType,
			);
		default:
			throw new Error(`Unsupported registration type command: ${command.type}`);
	}
}
