import type { CollectionMethod } from '@simmer-mosquito/sync';
import { CATALOG_SAVE_REFUSALS } from '../../lib/acknowledgement-copy';
import { collection_methods } from '../../lib/collections/collection_methods';
import type { Acknowledgements } from '../use-acknowledged-write';
import {
	type CatalogFields,
	type CatalogMutations,
	catalogAcknowledgements,
	catalogMutations,
	catalogRowBase,
	collectionMethodCommands,
} from './catalog-fields';
import { createCatalogRow, saveCatalogRow } from './catalog-writes';
import { canAttributeWrite } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for collection methods: create, save, deactivate, reactivate and delete. */
export function useCollectionMethodMutations(): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = async (fields: CatalogFields) => {
		if (organizationId === null) {
			throw new Error('Your profile is still loading.');
		}
		const row = {
			...catalogRowBase(organizationId, actorProfileId),
			name: fields.name,
			description: fields.description ?? null,
			custom_schema: fields.customSchema ?? null,
			action_threshold: fields.actionThreshold ?? null,
			is_active: fields.isActive,
		} satisfies CollectionMethod;
		await createCatalogRow(collection_methods(), collectionMethodCommands, row);
		return row.id;
	};

	const save = async (
		id: string,
		fields: CatalogFields,
		current: CatalogFields,
		acknowledgements: Acknowledgements,
	) => {
		const changes: Partial<CollectionMethod> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		if (fields.customSchema !== current.customSchema) {
			changes.custom_schema = fields.customSchema ?? null;
		}
		if (fields.actionThreshold !== current.actionThreshold) {
			changes.action_threshold = fields.actionThreshold ?? null;
		}
		await saveCatalogRow(collection_methods(), collectionMethodCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
			acknowledgements: catalogAcknowledgements(CATALOG_SAVE_REFUSALS, acknowledgements, {
				renames: changes.name !== undefined,
				retires: !fields.isActive && current.isActive,
			}),
		});
	};

	return catalogMutations(collection_methods(), collectionMethodCommands, CATALOG_SAVE_REFUSALS, {
		create,
		save,
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	});
}
