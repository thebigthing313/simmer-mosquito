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
	agencyCommandContext,
	type CommandContext,
	createCommand,
	handleCommandError,
	insertRegistrationType,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readJsonObject,
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
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				subscribeNotificationRegistrationTypeCommand({
					...ctx,
					notificationRegistrationTypeId: readText(raw.payload.id) ?? '',
					notificationRegistrationId: readText(raw.payload.notificationRegistrationId) ?? '',
					notificationTypeId: readText(raw.payload.notificationTypeId) ?? '',
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegistrationTypeCommands(context, options.db, [result.command], 201);
		},
	);

	app.delete(
		'/public-engagement/notification-registration-types/:notificationRegistrationTypeId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				unsubscribeNotificationRegistrationTypeCommand({
					...ctx,
					notificationRegistrationTypeId: context.req.param('notificationRegistrationTypeId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegistrationTypeCommands(context, options.db, [result.command]);
		},
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
