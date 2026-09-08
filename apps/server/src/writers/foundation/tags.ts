import {
	createOrgLookup,
	createTag,
	type DeletableRecordType,
	deleteCollectionLureLookup,
	deleteCollectionMethodLookup,
	deleteHabitatTypeLookup,
	deleteTag,
	type OrgLookupRow,
	setCollectionLureLookupActive,
	setCollectionMethodLookupActive,
	setHabitatTypeLookupActive,
	setTagActive,
	type TagRow,
	updateCollectionLureLookup,
	updateCollectionMethodLookup,
	updateHabitatTypeLookup,
	updateTag,
} from '@simmer-mosquito/db';
import type {
	CreateCollectionLureCommand,
	CreateCollectionMethodCommand,
	CreateHabitatTypeCommand,
	DeactivateCollectionLureCommand,
	DeactivateCollectionMethodCommand,
	DeactivateHabitatTypeCommand,
	DeleteCollectionLureCommand,
	DeleteCollectionMethodCommand,
	DeleteHabitatTypeCommand,
	ReactivateCollectionLureCommand,
	ReactivateCollectionMethodCommand,
	ReactivateHabitatTypeCommand,
	UpdateCollectionLureCommand,
	UpdateCollectionMethodCommand,
	UpdateHabitatTypeCommand,
} from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../../command-write.js';
import { assertCitedHistoryAcknowledged } from '../../record-history.js';
import type { LookupCommand, TagCommand } from './shared.js';

// --------------------------------------------------------------------------
// Tags
// --------------------------------------------------------------------------

/**
 * The three catalogs share one rename question, so they share one call.
 *
 * A catalog row carries no snapshot onto the records that point at it: a
 * collection stores `collection_method_id`, never the name the method had that
 * morning, so a rename relabels every one of them. The other fields on these
 * rows — the notes, the custom schema, the action threshold — are not what a
 * past record is read back under, which is why only `name` opens the question.
 */
async function assertLookupRename(
	db: CommandTransaction,
	recordType: DeletableRecordType,
	subject: string,
	recordId: string,
	payload: {
		readonly organizationId: string;
		readonly changes: { readonly name?: string };
		readonly acknowledgedHistoricalLabelChange: boolean;
	},
): Promise<void> {
	await assertCitedHistoryAcknowledged(db, {
		recordType,
		recordId,
		subject,
		organizationId: payload.organizationId,
		acknowledgement: 'acknowledgedHistoricalLabelChange',
		acknowledged: payload.acknowledgedHistoricalLabelChange,
		relabels: payload.changes.name !== undefined,
	});
}

export async function writeFoundationLookupCommand(
	db: CommandTransaction,
	command: LookupCommand,
): Promise<OrgLookupRow | null> {
	switch (command.type) {
		case 'foundation.createCollectionMethod': {
			const createPayload = (command as CreateCollectionMethodCommand).payload;
			return createOrgLookup(db, 'collection_methods', {
				id: createPayload.collectionMethodId,
				organizationId: createPayload.organizationId,
				name: createPayload.name,
				description: createPayload.description,
				customSchema: createPayload.customSchema,
				actionThreshold: createPayload.actionThreshold,
				isActive: true,
				createdByProfileId: createPayload.actorProfileId,
				updatedByProfileId: createPayload.actorProfileId,
			});
		}
		case 'foundation.updateCollectionMethod': {
			const updatePayload = (command as UpdateCollectionMethodCommand).payload;
			await assertLookupRename(
				db,
				'collectionMethod',
				'collection method',
				updatePayload.collectionMethodId,
				updatePayload,
			);
			return updateCollectionMethodLookup(db, updatePayload.collectionMethodId, {
				organizationId: updatePayload.organizationId,
				...updatePayload.changes,
				updatedByProfileId: updatePayload.actorProfileId,
			});
		}
		case 'foundation.deactivateCollectionMethod': {
			const lifecyclePayload = (command as DeactivateCollectionMethodCommand).payload;
			return setCollectionMethodLookupActive(db, lifecyclePayload.collectionMethodId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: false,
			});
		}
		case 'foundation.reactivateCollectionMethod': {
			const lifecyclePayload = (command as ReactivateCollectionMethodCommand).payload;
			return setCollectionMethodLookupActive(db, lifecyclePayload.collectionMethodId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: true,
			});
		}
		case 'foundation.deleteCollectionMethod': {
			const lifecyclePayload = (command as DeleteCollectionMethodCommand).payload;
			return deleteCollectionMethodLookup(db, lifecyclePayload.collectionMethodId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
			});
		}
		case 'foundation.createCollectionLure': {
			const createPayload = (command as CreateCollectionLureCommand).payload;
			return createOrgLookup(db, 'collection_lures', {
				id: createPayload.collectionLureId,
				organizationId: createPayload.organizationId,
				name: createPayload.name,
				description: createPayload.description,
				isActive: true,
				createdByProfileId: createPayload.actorProfileId,
				updatedByProfileId: createPayload.actorProfileId,
			});
		}
		case 'foundation.updateCollectionLure': {
			const updatePayload = (command as UpdateCollectionLureCommand).payload;
			await assertLookupRename(
				db,
				'collectionLure',
				'lure',
				updatePayload.collectionLureId,
				updatePayload,
			);
			return updateCollectionLureLookup(db, updatePayload.collectionLureId, {
				organizationId: updatePayload.organizationId,
				...updatePayload.changes,
				updatedByProfileId: updatePayload.actorProfileId,
			});
		}
		case 'foundation.deactivateCollectionLure': {
			const lifecyclePayload = (command as DeactivateCollectionLureCommand).payload;
			return setCollectionLureLookupActive(db, lifecyclePayload.collectionLureId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: false,
			});
		}
		case 'foundation.reactivateCollectionLure': {
			const lifecyclePayload = (command as ReactivateCollectionLureCommand).payload;
			return setCollectionLureLookupActive(db, lifecyclePayload.collectionLureId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: true,
			});
		}
		case 'foundation.deleteCollectionLure': {
			const lifecyclePayload = (command as DeleteCollectionLureCommand).payload;
			return deleteCollectionLureLookup(db, lifecyclePayload.collectionLureId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
			});
		}
		case 'foundation.createHabitatType': {
			const createPayload = (command as CreateHabitatTypeCommand).payload;
			return createOrgLookup(db, 'habitat_types', {
				id: createPayload.habitatTypeId,
				organizationId: createPayload.organizationId,
				name: createPayload.name,
				description: createPayload.description,
				customSchema: createPayload.customSchema,
				isActive: true,
				createdByProfileId: createPayload.actorProfileId,
				updatedByProfileId: createPayload.actorProfileId,
			});
		}
		case 'foundation.updateHabitatType': {
			const updatePayload = (command as UpdateHabitatTypeCommand).payload;
			await assertLookupRename(
				db,
				'habitatType',
				'habitat type',
				updatePayload.habitatTypeId,
				updatePayload,
			);
			return updateHabitatTypeLookup(db, updatePayload.habitatTypeId, {
				organizationId: updatePayload.organizationId,
				...updatePayload.changes,
				updatedByProfileId: updatePayload.actorProfileId,
			});
		}
		case 'foundation.deactivateHabitatType': {
			const lifecyclePayload = (command as DeactivateHabitatTypeCommand).payload;
			return setHabitatTypeLookupActive(db, lifecyclePayload.habitatTypeId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: false,
			});
		}
		case 'foundation.reactivateHabitatType': {
			const lifecyclePayload = (command as ReactivateHabitatTypeCommand).payload;
			return setHabitatTypeLookupActive(db, lifecyclePayload.habitatTypeId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
				isActive: true,
			});
		}
		case 'foundation.deleteHabitatType': {
			const lifecyclePayload = (command as DeleteHabitatTypeCommand).payload;
			return deleteHabitatTypeLookup(db, lifecyclePayload.habitatTypeId, {
				organizationId: lifecyclePayload.organizationId,
				actorProfileId: lifecyclePayload.actorProfileId,
			});
		}
	}
}

export async function writeFoundationTagCommand(
	db: CommandTransaction,
	command: TagCommand,
): Promise<TagRow | null> {
	switch (command.type) {
		case 'fieldWork.createTag': {
			const payload = command.payload;
			return createTag(db, {
				id: payload.tagId,
				organizationId: payload.organizationId,
				tagName: payload.tagName,
				description: payload.description,
				color: payload.color,
				isActive: true,
				createdByProfileId: payload.actorProfileId,
				updatedByProfileId: payload.actorProfileId,
			});
		}
		case 'fieldWork.updateTag': {
			const payload = command.payload;
			return updateTag(db, payload.tagId, {
				organizationId: payload.organizationId,
				...payload.changes,
				updatedByProfileId: payload.actorProfileId,
			});
		}
		case 'fieldWork.activateTag': {
			const payload = command.payload;
			return setTagActive(db, payload.tagId, {
				organizationId: payload.organizationId,
				actorProfileId: payload.actorProfileId,
				isActive: true,
			});
		}
		case 'fieldWork.deactivateTag': {
			const payload = command.payload;
			return setTagActive(db, payload.tagId, {
				organizationId: payload.organizationId,
				actorProfileId: payload.actorProfileId,
				isActive: false,
			});
		}
		case 'fieldWork.deleteTag': {
			const payload = command.payload;
			return deleteTag(db, payload.tagId, {
				organizationId: payload.organizationId,
				actorProfileId: payload.actorProfileId,
			});
		}
	}
}
