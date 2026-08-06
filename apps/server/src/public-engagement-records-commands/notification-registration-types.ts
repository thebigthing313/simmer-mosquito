import {
	type PublicEngagementCommand,
	subscribeNotificationRegistrationTypeCommand,
	unsubscribeNotificationRegistrationTypeCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type CommandContext,
	commandEndpoint,
	handleCommandError,
	insertRegistrationType,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	registrationTypeReturnColumns,
	type SafeRegistrationType,
	softDelete,
	toSafeRegistrationType,
	writeCommands,
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
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(db, commands, writeRegistrationTypeCommand);
		if (result.row === null) {
			return context.json({ error: 'notification_registration_type_not_found' }, 404);
		}
		return context.json(
			{ notificationRegistrationType: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
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
