import {
	type ContactReferenceInput,
	createNotificationRegistrationCommand,
	deactivateNotificationRegistrationCommand,
	deleteNotificationRegistrationCommand,
	type NotificationRegistrationLocationInput,
	type PublicEngagementCommand,
	reactivateNotificationRegistrationCommand,
	updateNotificationRegistrationBufferCommand,
	updateNotificationRegistrationContactCommand,
	updateNotificationRegistrationFlagsCommand,
	updateNotificationRegistrationLocationCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	insertRegistrationType,
	invalidUpdate,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readNumberOrNull,
	readSubscriptions,
	registrationReturnColumns,
	resolveContact,
	resolveNotificationAddress,
	runCommands,
	type SafeRegistration,
	softDelete,
	toSafeRegistration,
	updateRow,
} from './shared.js';

// ===========================================================================
// Notification registrations
// ===========================================================================

export function registerNotificationRegistrationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/public-engagement/notification-registrations',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createNotificationRegistrationCommand({
					...ctx,
					notificationRegistrationId: readText(payload.id) ?? '',
					contact: payload.contact as ContactReferenceInput,
					location: payload.location as NotificationRegistrationLocationInput,
					bufferDistance: readNumberOrNull(payload.bufferDistance),
					bufferUnitId: readNullableText(payload.bufferUnitId),
					hasBees: payload.hasBees === true,
					isNoSpray: payload.isNoSpray === true,
					subscriptions: readSubscriptions(payload.subscriptions),
				}),
			run: (context, commands) => runRegistrationCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/public-engagement/notification-registrations/:notificationRegistrationId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildRegistrationUpdateCommands(authContext, param('notificationRegistrationId'), payload),
			run: (context, commands) => runRegistrationCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/public-engagement/notification-registrations/:notificationRegistrationId/contact',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateNotificationRegistrationContactCommand({
					...ctx,
					notificationRegistrationId: param('notificationRegistrationId'),
					contact: payload.contact as ContactReferenceInput,
				}),
			run: (context, commands) => runRegistrationCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/public-engagement/notification-registrations/:notificationRegistrationId/location',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateNotificationRegistrationLocationCommand({
					...ctx,
					notificationRegistrationId: param('notificationRegistrationId'),
					location: payload.location as NotificationRegistrationLocationInput,
				}),
			run: (context, commands) => runRegistrationCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/public-engagement/notification-registrations/:notificationRegistrationId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteNotificationRegistrationCommand({
					...ctx,
					notificationRegistrationId: param('notificationRegistrationId'),
				}),
			run: (context, commands) => runRegistrationCommands(context, options.db, commands),
		}),
	);
}

function buildRegistrationUpdateCommands(
	authContext: AuthContext,
	notificationRegistrationId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: PublicEngagementCommand[] = [];

	if ('hasBees' in payload || 'isNoSpray' in payload) {
		const result = createCommand(() =>
			updateNotificationRegistrationFlagsCommand({
				...ctx,
				notificationRegistrationId,
				...('hasBees' in payload ? { hasBees: payload.hasBees === true } : {}),
				...('isNoSpray' in payload ? { isNoSpray: payload.isNoSpray === true } : {}),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('bufferDistance' in payload || 'bufferUnitId' in payload) {
		const result = createCommand(() =>
			updateNotificationRegistrationBufferCommand({
				...ctx,
				notificationRegistrationId,
				bufferDistance: readNumberOrNull(payload.bufferDistance),
				bufferUnitId: readNullableText(payload.bufferUnitId),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('contactId' in payload) {
		const result = createCommand(() =>
			updateNotificationRegistrationContactCommand({
				...ctx,
				notificationRegistrationId,
				contact: { kind: 'existing', contactId: readText(payload.contactId) ?? '' },
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (typeof payload.isActive === 'boolean') {
		const result = createCommand(() =>
			payload.isActive
				? reactivateNotificationRegistrationCommand({ ...ctx, notificationRegistrationId })
				: deactivateNotificationRegistrationCommand({ ...ctx, notificationRegistrationId }),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('notification registration');
	}
	return { ok: true, commands };
}

async function runRegistrationCommands(
	context: CommandContext,
	db: PublicEngagementDb,
	commands: readonly PublicEngagementCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeRegistrationCommand,
			notFound: 'notification_registration_not_found',
			key: 'notificationRegistration',
		},
		commands,
		createdStatus,
	);
}

export async function writeRegistrationCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<SafeRegistration | null> {
	switch (command.type) {
		case 'publicEngagement.createNotificationRegistration': {
			const contactId = await resolveContact(
				trx,
				command.payload.organizationId,
				command.payload.contact,
				command.payload.actorProfileId,
			);
			const addressId = await resolveNotificationAddress(
				trx,
				command.payload.organizationId,
				command.payload.location.address,
				command.payload.actorProfileId,
			);
			const row = await trx
				.insertInto('notification_registrations')
				.values({
					id: command.payload.notificationRegistrationId,
					organization_id: command.payload.organizationId,
					contact_id: contactId,
					geom: geojsonToGeom(command.payload.location.geometry),
					address_id: addressId,
					buffer_distance: command.payload.bufferDistance,
					buffer_unit_id: command.payload.bufferUnitId,
					has_bees: command.payload.hasBees,
					is_no_spray: command.payload.isNoSpray,
					is_active: true,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(registrationReturnColumns)
				.executeTakeFirstOrThrow();
			for (const subscription of command.payload.subscriptions) {
				await insertRegistrationType(
					trx,
					command.payload.organizationId,
					subscription.notificationRegistrationTypeId,
					command.payload.notificationRegistrationId,
					subscription.notificationTypeId,
					command.payload.actorProfileId,
				);
			}
			return toSafeRegistration(row);
		}
		case 'publicEngagement.updateNotificationRegistrationContact': {
			const contactId = await resolveContact(
				trx,
				command.payload.organizationId,
				command.payload.contact,
				command.payload.actorProfileId,
			);
			return updateRegistration(
				trx,
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				{
					contact_id: contactId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'publicEngagement.updateNotificationRegistrationLocation': {
			const addressId = await resolveNotificationAddress(
				trx,
				command.payload.organizationId,
				command.payload.location.address,
				command.payload.actorProfileId,
			);
			return updateRegistration(
				trx,
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				{
					geom: geojsonToGeom(command.payload.location.geometry),
					address_id: addressId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'publicEngagement.updateNotificationRegistrationBuffer':
			return updateRegistration(
				trx,
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				{
					buffer_distance: command.payload.bufferDistance,
					buffer_unit_id: command.payload.bufferUnitId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.updateNotificationRegistrationFlags':
			return updateRegistration(
				trx,
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				{
					...('hasBees' in command.payload.changes
						? { has_bees: command.payload.changes.hasBees ?? false }
						: {}),
					...('isNoSpray' in command.payload.changes
						? { is_no_spray: command.payload.changes.isNoSpray ?? false }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.deactivateNotificationRegistration':
			return updateRegistration(
				trx,
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				{
					is_active: false,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.reactivateNotificationRegistration':
			return updateRegistration(
				trx,
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				{
					is_active: true,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.deleteNotificationRegistration':
			return softDelete(
				trx,
				'notification_registrations',
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				registrationReturnColumns,
				toSafeRegistration,
			);
		default:
			throw new Error(`Unsupported notification registration command: ${command.type}`);
	}
}

async function updateRegistration(
	trx: PublicEngagementTransaction,
	notificationRegistrationId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<SafeRegistration | null> {
	return updateRow(
		trx,
		'notification_registrations',
		notificationRegistrationId,
		organizationId,
		set,
		registrationReturnColumns,
		toSafeRegistration,
	);
}
