import { assertHistoryAcknowledged } from '@simmer-mosquito/db';
import {
	type PublicEngagementCommand,
	subscribeNotificationRegistrationTypeCommand,
	unsubscribeNotificationRegistrationTypeCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { acknowledged, readText } from '../command-payload.js';
import { sentNotificationRule } from '../record-history.js';
import {
	type CommandContext,
	commandEndpoint,
	insertRegistrationType,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RegistrationTypeRow,
	type RouteOptions,
	registrationTypeReturnColumns,
	runCommands,
	softDelete,
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
			build: ({ payload, organization: ctx }) =>
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
			// Optional rather than none: the unsubscribe is refused when
			// notifications have already gone out under it, and a DELETE with no
			// body has nowhere to put the answer.
			body: 'optional',
			build: ({ payload, organization: ctx, param }) =>
				unsubscribeNotificationRegistrationTypeCommand({
					...ctx,
					notificationRegistrationTypeId: param('notificationRegistrationTypeId'),
					acknowledgedFutureOnlyChange: acknowledged(payload, 'acknowledgedFutureOnlyChange'),
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

export async function writeRegistrationTypeCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<RegistrationTypeRow | null> {
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
		case 'publicEngagement.unsubscribeNotificationRegistrationType': {
			// Dropping a subscription does not unsend what went out under it. The
			// count is this registration's notifications of this type alone, because
			// the rest of what it was sent is unaffected by the write.
			const subscription = await trx
				.selectFrom('notification_registration_types')
				.select(['notification_registration_id', 'notification_type_id'])
				.where('id', '=', command.payload.notificationRegistrationTypeId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			if (subscription !== undefined) {
				await assertHistoryAcknowledged(trx, {
					acknowledgement: 'acknowledgedFutureOnlyChange',
					acknowledged: command.payload.acknowledgedFutureOnlyChange,
					subject: 'subscription',
					rules: [
						sentNotificationRule(
							subscription.notification_registration_id,
							subscription.notification_type_id,
							command.payload.organizationId,
						),
					],
				});
			}
			return softDelete(
				trx,
				'notification_registration_types',
				command.payload.notificationRegistrationTypeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				registrationTypeReturnColumns,
			);
		}
		default:
			throw new Error(`Unsupported registration type command: ${command.type}`);
	}
}
