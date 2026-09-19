import type { NotificationType } from '@simmer-mosquito/sync';
import { NOTIFICATION_TYPE_SAVE_REFUSALS } from '../../lib/acknowledgement-copy';
import { notification_types } from '../../lib/collections/notification_types';
import type { Acknowledgements } from '../use-acknowledged-write';
import {
	type CatalogFields,
	type CatalogMutations,
	catalogAcknowledgements,
	catalogMutations,
	catalogRowBase,
	notificationTypeCommands,
} from './catalog-fields';
import { createCatalogRow, saveCatalogRow } from './catalog-writes';
import { canAttributeWrite } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for notification types: create, save, deactivate, reactivate and delete. */
export function useNotificationTypeMutations(): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = async (fields: CatalogFields) => {
		if (organizationId === null) {
			throw new Error('Your profile is still loading.');
		}
		const row = {
			...catalogRowBase(organizationId, actorProfileId),
			name: fields.name,
			description: fields.description ?? null,
			is_active: fields.isActive,
		} satisfies NotificationType;
		await createCatalogRow(notification_types(), notificationTypeCommands, row);
		return row.id;
	};

	const save = async (
		id: string,
		fields: CatalogFields,
		current: CatalogFields,
		acknowledgements: Acknowledgements,
	) => {
		const changes: Partial<NotificationType> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		await saveCatalogRow(notification_types(), notificationTypeCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
			acknowledgements: catalogAcknowledgements(NOTIFICATION_TYPE_SAVE_REFUSALS, acknowledgements, {
				renames: changes.name !== undefined,
				retires: !fields.isActive && current.isActive,
			}),
		});
	};

	return catalogMutations(
		notification_types(),
		notificationTypeCommands,
		NOTIFICATION_TYPE_SAVE_REFUSALS,
		{
			create,
			save,
			canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
		},
	);
}
