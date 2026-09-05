/**
 * The four notification tables, as commands.
 *
 * `notification_types` is the catalog an agency defines; a
 * `notification_registrations` row is a member of the public who wants telling
 * before a mission runs near them; `notification_registration_types` is the link
 * between the two; and `mission_notifications` is one actual notification owed
 * for one mission. Twenty commands.
 *
 * ## A `default:` that reopened
 *
 * The mission-notification route switched on `payload.status` — `'completed'`,
 * `'failed'`, `'skipped'`, and `default:` for reopen. So a body whose status was
 * misspelled, or absent, or any string at all, silently reopened a notification
 * somebody had already dealt with. That is the last of the branch's
 * value-read-for-direction, and the worst-behaved: the other ones at least had
 * two outcomes, where this had four and a catch-all.
 *
 * Four names now. `status` is a column, and this map does not read it.
 *
 * ## `generateMissionNotifications` is not here
 *
 * It has a writer now (#163), and still does not belong in this map. Every
 * intent here translates a body into one command against the row the path names.
 * Generation names a mission, writes as many `mission_notifications` rows as the
 * spatial match turns up, and answers with the set, which `runCommands` and its
 * `{ row, txid }` have nowhere to put. Its route is
 * `public-engagement-records-commands/mission-notification-generation.ts`, and
 * the permission entry it already had applies there unchanged.
 *
 * ## Field names
 *
 * Postgres column names: `name`, `description`, `buffer_distance`,
 * `buffer_unit_id`, `has_bees`, `is_no_spray`, `notification_registration_id`,
 * `notification_type_id`, `status_changed_at`. `contact` and `location` are
 * references rather than columns — see `contacts.ts` for why.
 */

import {
	type ContactReferenceInput,
	completeMissionNotificationCommand,
	createNotificationRegistrationCommand,
	createNotificationTypeCommand,
	deactivateNotificationRegistrationCommand,
	deactivateNotificationTypeCommand,
	deleteNotificationRegistrationCommand,
	deleteNotificationTypeCommand,
	failMissionNotificationCommand,
	type NotificationRegistrationLocationInput,
	type PublicEngagementCommand,
	reactivateNotificationRegistrationCommand,
	reactivateNotificationTypeCommand,
	reopenMissionNotificationCommand,
	skipMissionNotificationCommand,
	subscribeNotificationRegistrationTypeCommand,
	unsubscribeNotificationRegistrationTypeCommand,
	updateNotificationRegistrationBufferCommand,
	updateNotificationRegistrationContactCommand,
	updateNotificationRegistrationFlagsCommand,
	updateNotificationRegistrationLocationCommand,
	updateNotificationTypeCommand,
} from '@simmer-mosquito/domain';
import { type CommandPayload, readNullableText, readNumber, readText } from '../command-payload.js';
import { type CommandDb, readDate } from '../command-write.js';
import {
	type NotificationTypeCommand,
	type NotificationTypeRow,
	writeNotificationTypeCommand,
} from '../public-engagement-commands.js';
import { writeMissionNotificationCommand } from '../public-engagement-records-commands/mission-notifications.js';
import { writeRegistrationTypeCommand } from '../public-engagement-records-commands/notification-registration-types.js';
import { writeRegistrationCommand } from '../public-engagement-records-commands/notification-registrations.js';
import type {
	MissionNotificationRow,
	RegistrationRow,
	RegistrationTypeRow,
} from '../public-engagement-records-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The keys a registration write reads that are not its columns: who to reach,
 * where they are, and which notification types they are signed up for.
 */
type RegistrationArgument = 'contact' | 'location' | 'subscriptions';

/** The body of a write to this module's table. */
type MissionNotificationPayload = CommandPayload<'mission_notifications'>;

function flag(value: unknown): boolean {
	return value === true;
}

export function notificationTypeTableCommands(
	db: CommandDb,
): TableCommands<'notification_types', NotificationTypeCommand, NotificationTypeRow> {
	return {
		table: 'notification_types',
		run: {
			db,
			write: writeNotificationTypeCommand,
			notFound: 'notification_type_not_found',
			key: 'notificationType',
		},
		intents: {
			'publicEngagement.createNotificationType': ({ payload, organization, id }) =>
				createNotificationTypeCommand({
					...organization,
					notificationTypeId: id,
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
				}),

			'publicEngagement.updateNotificationType': ({ payload, organization, id }) =>
				updateNotificationTypeCommand({
					...organization,
					notificationTypeId: id,
					...(payload.name !== undefined ? { name: readText(payload.name) ?? '' } : {}),
					...(payload.description !== undefined
						? { description: readNullableText(payload.description) }
						: {}),
					acknowledgedHistoricalLabelChange: acknowledged(
						payload,
						'acknowledgedHistoricalLabelChange',
					),
				}),

			// Retiring a type is what its subscribers feel, which is what the
			// acknowledgement is about — and why reactivating carries none.
			'publicEngagement.deactivateNotificationType': ({ payload, organization, id }) =>
				deactivateNotificationTypeCommand({
					...organization,
					notificationTypeId: id,
					acknowledgedActiveSubscriptionImpact: acknowledged(
						payload,
						'acknowledgedActiveSubscriptionImpact',
					),
				}),

			'publicEngagement.reactivateNotificationType': ({ organization, id }) =>
				reactivateNotificationTypeCommand({ ...organization, notificationTypeId: id }),

			'publicEngagement.deleteNotificationType': ({ organization, id }) =>
				deleteNotificationTypeCommand({ ...organization, notificationTypeId: id }),
		},
	};
}

export function notificationRegistrationTableCommands(
	db: CommandDb,
): TableCommands<
	'notification_registrations',
	PublicEngagementCommand,
	RegistrationRow,
	RegistrationArgument
> {
	return {
		table: 'notification_registrations',
		run: {
			db,
			write: writeRegistrationCommand,
			notFound: 'notification_registration_not_found',
			key: 'notificationRegistration',
		},
		intents: {
			'publicEngagement.createNotificationRegistration': ({ payload, organization, id }) =>
				createNotificationRegistrationCommand({
					...organization,
					notificationRegistrationId: id,
					contact: payload.contact as ContactReferenceInput,
					location: payload.location as NotificationRegistrationLocationInput,
					bufferDistance: readNumber(payload.buffer_distance) ?? null,
					bufferUnitId: readNullableText(payload.buffer_unit_id),
					hasBees: flag(payload.has_bees),
					isNoSpray: flag(payload.is_no_spray),
					// The types they want telling about, created alongside the
					// registration — the link rows are the same write.
					...(payload.subscriptions === undefined
						? {}
						: { subscriptions: payload.subscriptions as never }),
				}),

			'publicEngagement.updateNotificationRegistrationContact': ({ payload, organization, id }) =>
				updateNotificationRegistrationContactCommand({
					...organization,
					notificationRegistrationId: id,
					contact: payload.contact as ContactReferenceInput,
					acknowledgedHistoricalContactChange: acknowledged(
						payload,
						'acknowledgedHistoricalContactChange',
					),
				}),

			// The three `acknowledgedFutureOnlyChange` commands all mean the same
			// thing by it: notifications already sent stay as they were sent, and only
			// missions from here on see the change.
			'publicEngagement.updateNotificationRegistrationLocation': ({ payload, organization, id }) =>
				updateNotificationRegistrationLocationCommand({
					...organization,
					notificationRegistrationId: id,
					location: payload.location as NotificationRegistrationLocationInput,
					acknowledgedFutureOnlyChange: acknowledged(payload, 'acknowledgedFutureOnlyChange'),
				}),

			// Both halves are required rather than presence-read: a distance without a
			// unit is not a buffer, and clearing one means clearing both.
			'publicEngagement.updateNotificationRegistrationBuffer': ({ payload, organization, id }) =>
				updateNotificationRegistrationBufferCommand({
					...organization,
					notificationRegistrationId: id,
					bufferDistance: readNumber(payload.buffer_distance) ?? null,
					bufferUnitId: readNullableText(payload.buffer_unit_id),
					acknowledgedFutureOnlyChange: acknowledged(payload, 'acknowledgedFutureOnlyChange'),
				}),

			'publicEngagement.updateNotificationRegistrationFlags': ({ payload, organization, id }) =>
				updateNotificationRegistrationFlagsCommand({
					...organization,
					notificationRegistrationId: id,
					...(payload.has_bees !== undefined ? { hasBees: flag(payload.has_bees) } : {}),
					...(payload.is_no_spray !== undefined ? { isNoSpray: flag(payload.is_no_spray) } : {}),
					acknowledgedFutureOnlyChange: acknowledged(payload, 'acknowledgedFutureOnlyChange'),
				}),

			'publicEngagement.deactivateNotificationRegistration': ({ organization, id }) =>
				deactivateNotificationRegistrationCommand({
					...organization,
					notificationRegistrationId: id,
				}),

			'publicEngagement.reactivateNotificationRegistration': ({ organization, id }) =>
				reactivateNotificationRegistrationCommand({
					...organization,
					notificationRegistrationId: id,
				}),

			'publicEngagement.deleteNotificationRegistration': ({ organization, id }) =>
				deleteNotificationRegistrationCommand({ ...organization, notificationRegistrationId: id }),
		},
	};
}

export function notificationRegistrationTypeTableCommands(
	db: CommandDb,
): TableCommands<'notification_registration_types', PublicEngagementCommand, RegistrationTypeRow> {
	return {
		table: 'notification_registration_types',
		run: {
			db,
			write: writeRegistrationTypeCommand,
			notFound: 'notification_registration_type_not_found',
			key: 'notificationRegistrationType',
		},
		intents: {
			// A link row like `application_batches` and `formulation_insecticides`:
			// subscribing is an insert into a table the client syncs.
			'publicEngagement.subscribeNotificationRegistrationType': ({ payload, organization, id }) =>
				subscribeNotificationRegistrationTypeCommand({
					...organization,
					notificationRegistrationTypeId: id,
					notificationRegistrationId: readText(payload.notification_registration_id) ?? '',
					notificationTypeId: readText(payload.notification_type_id) ?? '',
				}),

			'publicEngagement.unsubscribeNotificationRegistrationType': ({ payload, organization, id }) =>
				unsubscribeNotificationRegistrationTypeCommand({
					...organization,
					notificationRegistrationTypeId: id,
					acknowledgedFutureOnlyChange: acknowledged(payload, 'acknowledgedFutureOnlyChange'),
				}),
		},
	};
}

export function missionNotificationTableCommands(
	db: CommandDb,
): TableCommands<'mission_notifications', PublicEngagementCommand, MissionNotificationRow> {
	// All four say when the status moved, and nothing else.
	const statusChange = (payload: MissionNotificationPayload) => {
		const statusChangedAt = readDate(payload.status_changed_at);
		return statusChangedAt === null ? {} : { statusChangedAt };
	};

	return {
		table: 'mission_notifications',
		run: {
			db,
			write: writeMissionNotificationCommand,
			notFound: 'mission_notification_not_found',
			key: 'missionNotification',
		},
		intents: {
			'publicEngagement.completeMissionNotification': ({ payload, organization, id }) =>
				completeMissionNotificationCommand({
					...organization,
					missionNotificationId: id,
					...statusChange(payload),
				}),

			'publicEngagement.failMissionNotification': ({ payload, organization, id }) =>
				failMissionNotificationCommand({
					...organization,
					missionNotificationId: id,
					...statusChange(payload),
				}),

			'publicEngagement.skipMissionNotification': ({ payload, organization, id }) =>
				skipMissionNotificationCommand({
					...organization,
					missionNotificationId: id,
					...statusChange(payload),
				}),

			// Was the `default:` arm, which is why an unrecognised status used to land
			// here rather than being refused.
			'publicEngagement.reopenMissionNotification': ({ payload, organization, id }) =>
				reopenMissionNotificationCommand({
					...organization,
					missionNotificationId: id,
					...statusChange(payload),
				}),
		},
	};
}
