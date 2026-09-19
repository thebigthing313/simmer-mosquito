import type { CollectionLure } from '@simmer-mosquito/sync';
import { CATALOG_SAVE_REFUSALS } from '../../lib/acknowledgement-copy';
import { collection_lures } from '../../lib/collections/collection_lures';
import type { Acknowledgements } from '../use-acknowledged-write';
import {
	type CatalogFields,
	type CatalogMutations,
	catalogAcknowledgements,
	catalogMutations,
	catalogRowBase,
	collectionLureCommands,
} from './catalog-fields';
import { createCatalogRow, saveCatalogRow } from './catalog-writes';
import { canAttributeWrite } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for collection lures: create, save, deactivate, reactivate and delete. */
export function useCollectionLureMutations(): CatalogMutations {
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
		} satisfies CollectionLure;
		await createCatalogRow(collection_lures(), collectionLureCommands, row);
		return row.id;
	};

	const save = async (
		id: string,
		fields: CatalogFields,
		current: CatalogFields,
		acknowledgements: Acknowledgements,
	) => {
		const changes: Partial<CollectionLure> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		await saveCatalogRow(collection_lures(), collectionLureCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
			acknowledgements: catalogAcknowledgements(CATALOG_SAVE_REFUSALS, acknowledgements, {
				renames: changes.name !== undefined,
				retires: !fields.isActive && current.isActive,
			}),
		});
	};

	return catalogMutations(collection_lures(), collectionLureCommands, CATALOG_SAVE_REFUSALS, {
		create,
		save,
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	});
}
