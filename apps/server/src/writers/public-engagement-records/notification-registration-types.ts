import { assertHistoryAcknowledged } from '@simmer-mosquito/db';
import type { PublicEngagementCommand } from '@simmer-mosquito/domain';
import { sentNotificationRule } from '../../record-history.js';
import { returnColumns } from '../../return-columns.js';
import {
	insertRegistrationType,
	type PublicEngagementTransaction,
	type RegistrationTypeRow,
	softDelete,
} from './shared.js';

// ===========================================================================
// Notification registration types (subscriptions)
// ===========================================================================

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
				returnColumns.notification_registration_types,
			);
		}
		default:
			throw new Error(`Unsupported registration type command: ${command.type}`);
	}
}
