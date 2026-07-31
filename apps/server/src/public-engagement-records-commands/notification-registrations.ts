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
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	createCommand,
	geojsonToGeom,
	handleCommandError,
	insertRegistrationType,
	invalidUpdate,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readJsonObject,
	readNullableText,
	readNumberOrNull,
	readSubscriptions,
	readText,
	registrationReturnColumns,
	resolveContact,
	resolveNotificationAddress,
	type SafeRegistration,
	softDelete,
	toSafeRegistration,
	updateRow,
	writeCommands,
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
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const p = raw.payload;
			const result = createCommand(() =>
				createNotificationRegistrationCommand({
					...ctx,
					notificationRegistrationId: readText(p.id) ?? '',
					contact: p.contact as ContactReferenceInput,
					location: p.location as NotificationRegistrationLocationInput,
					bufferDistance: readNumberOrNull(p.bufferDistance),
					bufferUnitId: readNullableText(p.bufferUnitId),
					hasBees: p.hasBees === true,
					isNoSpray: p.isNoSpray === true,
					subscriptions: readSubscriptions(p.subscriptions),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegistrationCommands(context, options.db, [result.command], 201);
		},
	);

	app.patch(
		'/public-engagement/notification-registrations/:notificationRegistrationId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildRegistrationUpdateCommands(
				context.get('authContext'),
				context.req.param('notificationRegistrationId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runRegistrationCommands(context, options.db, commandsResult.commands);
		},
	);

	app.post(
		'/public-engagement/notification-registrations/:notificationRegistrationId/contact',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				updateNotificationRegistrationContactCommand({
					...ctx,
					notificationRegistrationId: context.req.param('notificationRegistrationId'),
					contact: raw.payload.contact as ContactReferenceInput,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegistrationCommands(context, options.db, [result.command]);
		},
	);

	app.post(
		'/public-engagement/notification-registrations/:notificationRegistrationId/location',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				updateNotificationRegistrationLocationCommand({
					...ctx,
					notificationRegistrationId: context.req.param('notificationRegistrationId'),
					location: raw.payload.location as NotificationRegistrationLocationInput,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegistrationCommands(context, options.db, [result.command]);
		},
	);

	app.delete(
		'/public-engagement/notification-registrations/:notificationRegistrationId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteNotificationRegistrationCommand({
					...ctx,
					notificationRegistrationId: context.req.param('notificationRegistrationId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegistrationCommands(context, options.db, [result.command]);
		},
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
	try {
		const result = await writeCommands(db, commands, writeRegistrationCommand);
		if (result.row === null) {
			return context.json({ error: 'notification_registration_not_found' }, 404);
		}
		return context.json(
			{ notificationRegistration: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRegistrationCommand(
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
