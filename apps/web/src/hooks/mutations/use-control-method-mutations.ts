import type { ApplicationMethod } from '@simmer-mosquito/sync';
import { CATALOG_SAVE_REFUSALS } from '../../lib/acknowledgement-copy';
import type { application_methods } from '../../lib/collections/application_methods';
import type { Acknowledgements } from '../use-acknowledged-write';
import {
	type CatalogFields,
	type CatalogMutations,
	catalogAcknowledgements,
	catalogMutations,
	catalogRowBase,
} from './catalog-fields';
import { type CatalogCommandNames, createCatalogRow, saveCatalogRow } from './catalog-writes';
import { canAttributeWrite } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for one control method catalog, over the collection and command names the caller fixes. */
export function useControlMethodMutations(
	collection: ReturnType<typeof application_methods>,
	names: CatalogCommandNames,
): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = async (fields: CatalogFields) => {
		if (organizationId === null) {
			throw new Error('Your profile is still loading.');
		}
		const row = {
			...catalogRowBase(organizationId, actorProfileId),
			name: fields.name,
			custom_schema: fields.customSchema ?? null,
			is_active: fields.isActive,
		} satisfies ApplicationMethod;
		await createCatalogRow(collection, names, row);
		return row.id;
	};

	const save = async (
		id: string,
		fields: CatalogFields,
		current: CatalogFields,
		acknowledgements: Acknowledgements,
	) => {
		const changes: Partial<ApplicationMethod> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.customSchema !== current.customSchema) {
			changes.custom_schema = fields.customSchema ?? null;
		}
		await saveCatalogRow(collection, names, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
			acknowledgements: catalogAcknowledgements(CATALOG_SAVE_REFUSALS, acknowledgements, {
				renames: changes.name !== undefined,
				retires: !fields.isActive && current.isActive,
			}),
		});
	};

	return catalogMutations(collection, names, CATALOG_SAVE_REFUSALS, {
		create,
		save,
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	});
}
