import {
	assertRecordDeletable,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import type {
	CreateNotificationTypeCommand,
	DeactivateNotificationTypeCommand,
	DeleteNotificationTypeCommand,
	ReactivateNotificationTypeCommand,
	UpdateNotificationTypeCommand,
} from '@simmer-mosquito/domain';
import { assertCitedHistoryAcknowledged } from '../record-history.js';
import { type CommandRow, returnColumns } from '../return-columns.js';

type PublicEngagementTransaction = Transaction<SimmerDatabase>;
export type NotificationTypeCommand =
	| CreateNotificationTypeCommand
	| UpdateNotificationTypeCommand
	| DeactivateNotificationTypeCommand
	| ReactivateNotificationTypeCommand
	| DeleteNotificationTypeCommand;

export type NotificationTypeRow = CommandRow<'notification_types'>;

export async function writeNotificationTypeCommand(
	db: PublicEngagementTransaction,
	command: NotificationTypeCommand,
): Promise<NotificationTypeRow | null> {
	switch (command.type) {
		case 'publicEngagement.createNotificationType':
			return createNotificationType(db, {
				id: command.payload.notificationTypeId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				description: command.payload.description,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'publicEngagement.updateNotificationType':
			// A sent notification, a registration's subscription and a mission all
			// store `notification_type_id` and no copy of the name, so a rename
			// relabels every one of them. The description is not what any of them is
			// read back under.
			await assertCitedHistoryAcknowledged(db, {
				recordType: 'notificationType',
				recordId: command.payload.notificationTypeId,
				organizationId: command.payload.organizationId,
				subject: 'notification type',
				acknowledgement: 'acknowledgedHistoricalLabelChange',
				acknowledged: command.payload.acknowledgedHistoricalLabelChange,
				relabels: command.payload.changes.name !== undefined,
			});
			return updateNotificationType(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'publicEngagement.deactivateNotificationType':
			// Not the whole citing set: retiring a type does not rewrite the
			// notifications already sent under it, it stops the people still
			// subscribed from being notified again. So the count is the live
			// subscriptions, which is what the flag is named after.
			await assertCitedHistoryAcknowledged(db, {
				recordType: 'notificationType',
				recordId: command.payload.notificationTypeId,
				organizationId: command.payload.organizationId,
				subject: 'notification type',
				acknowledgement: 'acknowledgedActiveSubscriptionImpact',
				acknowledged: command.payload.acknowledgedActiveSubscriptionImpact,
				relabels: true,
				only: ['notificationTypeRegistrations'],
			});
			return setNotificationTypeActive(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'publicEngagement.reactivateNotificationType':
			return setNotificationTypeActive(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'publicEngagement.deleteNotificationType':
			return deleteNotificationType(db, command.payload.notificationTypeId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

interface NotificationTypeWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface NotificationTypeUpdateInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly actorProfileId: string;
}

interface NotificationTypeLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

async function createNotificationType(
	db: PublicEngagementTransaction,
	input: NotificationTypeWriteInput,
): Promise<NotificationTypeRow> {
	const row = await db
		.insertInto('notification_types')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			name: input.name,
			description: input.description,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(returnColumns.notification_types)
		.executeTakeFirstOrThrow();

	return row;
}

async function updateNotificationType(
	db: PublicEngagementTransaction,
	notificationTypeId: string,
	input: NotificationTypeUpdateInput,
): Promise<NotificationTypeRow | null> {
	const row = await db
		.updateTable('notification_types')
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.description === undefined ? {} : { description: input.description }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', notificationTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns.notification_types)
		.executeTakeFirst();

	return row ?? null;
}

async function setNotificationTypeActive(
	db: PublicEngagementTransaction,
	notificationTypeId: string,
	input: NotificationTypeLifecycleInput & { readonly isActive: boolean },
): Promise<NotificationTypeRow | null> {
	const row = await db
		.updateTable('notification_types')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', notificationTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns.notification_types)
		.executeTakeFirst();

	return row ?? null;
}

async function deleteNotificationType(
	db: PublicEngagementTransaction,
	notificationTypeId: string,
	input: NotificationTypeLifecycleInput,
): Promise<NotificationTypeRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'notificationType',
		recordId: notificationTypeId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable('notification_types')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', notificationTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns.notification_types)
		.executeTakeFirst();

	return row ?? null;
}
