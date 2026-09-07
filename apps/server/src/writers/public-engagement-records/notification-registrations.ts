import { applyRecordDeletion, checkedValues } from '@simmer-mosquito/db';
import type { PublicEngagementCommand } from '@simmer-mosquito/domain';
import { assertCitedHistoryAcknowledged } from '../../record-history.js';
import {
	geojsonToGeom,
	insertRegistrationType,
	type PublicEngagementTransaction,
	type RegistrationRow,
	registrationReturnColumns,
	resolveContact,
	resolveNotificationAddress,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Notification registrations
// ===========================================================================

/**
 * Four registration edits ask the same question, so they share one call.
 *
 * A registration says who to notify, where, and about what. `mission_notifications`
 * records what was actually sent, and stores no copy of any of it, so moving the
 * pin, widening the buffer, correcting the contact or dropping a subscription
 * rewrites how every notification already sent from this registration reads. The
 * live subscriptions are not counted: they are the registration's own rows, not
 * a record of anything that happened.
 *
 * `acknowledgedFutureOnlyChange` is the flag on three of the four, and it is
 * named for the answer rather than the question — the organization is
 * confirming that the change applies from here on and does not restate what was
 * already sent.
 */
async function assertRegistrationHistory(
	trx: PublicEngagementTransaction,
	payload: {
		readonly organizationId: string;
		readonly notificationRegistrationId: string;
	} & Partial<
		Record<'acknowledgedFutureOnlyChange' | 'acknowledgedHistoricalContactChange', boolean>
	>,
	acknowledgement: 'acknowledgedFutureOnlyChange' | 'acknowledgedHistoricalContactChange',
): Promise<void> {
	await assertCitedHistoryAcknowledged(trx, {
		acknowledgement,
		recordType: 'notificationRegistration',
		recordId: payload.notificationRegistrationId,
		organizationId: payload.organizationId,
		subject: 'registration',
		acknowledged: payload[acknowledgement] === true,
		relabels: true,
		only: ['registrationMissionNotifications'],
	});
}

export async function writeRegistrationCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<RegistrationRow | null> {
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
				.values(
					await checkedValues(trx, command.payload.organizationId, {
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
					}),
				)
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
			return row;
		}
		case 'publicEngagement.updateNotificationRegistrationContact': {
			await assertRegistrationHistory(trx, command.payload, 'acknowledgedHistoricalContactChange');
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
			await assertRegistrationHistory(trx, command.payload, 'acknowledgedFutureOnlyChange');
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
			await assertRegistrationHistory(trx, command.payload, 'acknowledgedFutureOnlyChange');
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
			await assertRegistrationHistory(trx, command.payload, 'acknowledgedFutureOnlyChange');
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
			// Refuses while any live mission notification names the registration,
			// and soft-deletes the type subscriptions that do not. Both are registry
			// rules, so the danger zone's impact read and this write cannot come to
			// disagree about what a delete does (#322).
			await applyRecordDeletion(trx, {
				recordType: 'notificationRegistration',
				recordId: command.payload.notificationRegistrationId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				// Nothing to confirm: the subscriptions are this registration's own
				// link rows, and the one rule that reaches another record blocks.
				acknowledged: {},
			});
			return softDelete(
				trx,
				'notification_registrations',
				command.payload.notificationRegistrationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				registrationReturnColumns,
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
): Promise<RegistrationRow | null> {
	return updateRow(
		trx,
		'notification_registrations',
		notificationRegistrationId,
		organizationId,
		set,
		registrationReturnColumns,
	);
}
