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
import { readNullableText, readNumber, readText } from '../command-payload.js';
import { type CommandDb, readDate } from '../command-write.js';
import {
	type NotificationTypeCommand,
	type SafeNotificationType,
	writeNotificationTypeCommand,
} from '../public-engagement-commands.js';
import { writeMissionNotificationCommand } from '../public-engagement-records-commands/mission-notifications.js';
import { writeRegistrationTypeCommand } from '../public-engagement-records-commands/notification-registration-types.js';
import { writeRegistrationCommand } from '../public-engagement-records-commands/notification-registrations.js';
import type {
	SafeMissionNotification,
	SafeRegistration,
	SafeRegistrationType,
} from '../public-engagement-records-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

function flag(value: unknown): boolean {
	return value === true;
}

export function notificationTypeTableCommands(
	db: CommandDb,
): TableCommands<NotificationTypeCommand, SafeNotificationType> {
	return {
		table: 'notification_types',
		run: {
			db,
			write: writeNotificationTypeCommand,
			notFound: 'notification_type_not_found',
			key: 'notificationType',
		},
		intents: {
			'publicEngagement.createNotificationType': ({ payload, agency, id }) =>
				createNotificationTypeCommand({
					...agency,
					notificationTypeId: id,
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
				}),

			'publicEngagement.updateNotificationType': ({ payload, agency, id }) =>
				updateNotificationTypeCommand({
					...agency,
					notificationTypeId: id,
					...('name' in payload ? { name: readText(payload.name) ?? '' } : {}),
					...('description' in payload
						? { description: readNullableText(payload.description) }
						: {}),
					acknowledgedHistoricalLabelChange: acknowledged(
						payload.acknowledgedHistoricalLabelChange,
					),
				}),

			// Retiring a type is what its subscribers feel, which is what the
			// acknowledgement is about — and why reactivating carries none.
			'publicEngagement.deactivateNotificationType': ({ payload, agency, id }) =>
				deactivateNotificationTypeCommand({
					...agency,
					notificationTypeId: id,
					acknowledgedActiveSubscriptionImpact: acknowledged(
						payload.acknowledgedActiveSubscriptionImpact,
					),
				}),

			'publicEngagement.reactivateNotificationType': ({ agency, id }) =>
				reactivateNotificationTypeCommand({ ...agency, notificationTypeId: id }),

			'publicEngagement.deleteNotificationType': ({ agency, id }) =>
				deleteNotificationTypeCommand({ ...agency, notificationTypeId: id }),
		},
	};
}

export function notificationRegistrationTableCommands(
	db: CommandDb,
): TableCommands<PublicEngagementCommand, SafeRegistration> {
	return {
		table: 'notification_registrations',
		run: {
			db,
			write: writeRegistrationCommand,
			notFound: 'notification_registration_not_found',
			key: 'notificationRegistration',
		},
		intents: {
			'publicEngagement.createNotificationRegistration': ({ payload, agency, id }) =>
				createNotificationRegistrationCommand({
					...agency,
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

			'publicEngagement.updateNotificationRegistrationContact': ({ payload, agency, id }) =>
				updateNotificationRegistrationContactCommand({
					...agency,
					notificationRegistrationId: id,
					contact: payload.contact as ContactReferenceInput,
					acknowledgedHistoricalContactChange: acknowledged(
						payload.acknowledgedHistoricalContactChange,
					),
				}),

			// The three `acknowledgedFutureOnlyChange` commands all mean the same
			// thing by it: notifications already sent stay as they were sent, and only
			// missions from here on see the change.
			'publicEngagement.updateNotificationRegistrationLocation': ({ payload, agency, id }) =>
				updateNotificationRegistrationLocationCommand({
					...agency,
					notificationRegistrationId: id,
					location: payload.location as NotificationRegistrationLocationInput,
					acknowledgedFutureOnlyChange: acknowledged(payload.acknowledgedFutureOnlyChange),
				}),

			// Both halves are required rather than presence-read: a distance without a
			// unit is not a buffer, and clearing one means clearing both.
			'publicEngagement.updateNotificationRegistrationBuffer': ({ payload, agency, id }) =>
				updateNotificationRegistrationBufferCommand({
					...agency,
					notificationRegistrationId: id,
					bufferDistance: readNumber(payload.buffer_distance) ?? null,
					bufferUnitId: readNullableText(payload.buffer_unit_id),
					acknowledgedFutureOnlyChange: acknowledged(payload.acknowledgedFutureOnlyChange),
				}),

			'publicEngagement.updateNotificationRegistrationFlags': ({ payload, agency, id }) =>
				updateNotificationRegistrationFlagsCommand({
					...agency,
					notificationRegistrationId: id,
					...('has_bees' in payload ? { hasBees: flag(payload.has_bees) } : {}),
					...('is_no_spray' in payload ? { isNoSpray: flag(payload.is_no_spray) } : {}),
					acknowledgedFutureOnlyChange: acknowledged(payload.acknowledgedFutureOnlyChange),
				}),

			'publicEngagement.deactivateNotificationRegistration': ({ agency, id }) =>
				deactivateNotificationRegistrationCommand({ ...agency, notificationRegistrationId: id }),

			'publicEngagement.reactivateNotificationRegistration': ({ agency, id }) =>
				reactivateNotificationRegistrationCommand({ ...agency, notificationRegistrationId: id }),

			'publicEngagement.deleteNotificationRegistration': ({ agency, id }) =>
				deleteNotificationRegistrationCommand({ ...agency, notificationRegistrationId: id }),
		},
	};
}

export function notificationRegistrationTypeTableCommands(
	db: CommandDb,
): TableCommands<PublicEngagementCommand, SafeRegistrationType> {
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
			'publicEngagement.subscribeNotificationRegistrationType': ({ payload, agency, id }) =>
				subscribeNotificationRegistrationTypeCommand({
					...agency,
					notificationRegistrationTypeId: id,
					notificationRegistrationId: readText(payload.notification_registration_id) ?? '',
					notificationTypeId: readText(payload.notification_type_id) ?? '',
				}),

			'publicEngagement.unsubscribeNotificationRegistrationType': ({ payload, agency, id }) =>
				unsubscribeNotificationRegistrationTypeCommand({
					...agency,
					notificationRegistrationTypeId: id,
					acknowledgedFutureOnlyChange: acknowledged(payload.acknowledgedFutureOnlyChange),
				}),
		},
	};
}

export function missionNotificationTableCommands(
	db: CommandDb,
): TableCommands<PublicEngagementCommand, SafeMissionNotification> {
	// All four say when the status moved, and nothing else.
	const statusChange = (payload: Record<string, unknown>) => {
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
			'publicEngagement.completeMissionNotification': ({ payload, agency, id }) =>
				completeMissionNotificationCommand({
					...agency,
					missionNotificationId: id,
					...statusChange(payload),
				}),

			'publicEngagement.failMissionNotification': ({ payload, agency, id }) =>
				failMissionNotificationCommand({
					...agency,
					missionNotificationId: id,
					...statusChange(payload),
				}),

			'publicEngagement.skipMissionNotification': ({ payload, agency, id }) =>
				skipMissionNotificationCommand({
					...agency,
					missionNotificationId: id,
					...statusChange(payload),
				}),

			// Was the `default:` arm, which is why an unrecognised status used to land
			// here rather than being refused.
			'publicEngagement.reopenMissionNotification': ({ payload, agency, id }) =>
				reopenMissionNotificationCommand({
					...agency,
					missionNotificationId: id,
					...statusChange(payload),
				}),
		},
	};
}
