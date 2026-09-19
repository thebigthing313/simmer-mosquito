import type { HabitatType } from '@simmer-mosquito/sync';
import { CATALOG_SAVE_REFUSALS } from '../../lib/acknowledgement-copy';
import { habitat_types } from '../../lib/collections/habitat_types';
import type { Acknowledgements } from '../use-acknowledged-write';
import {
	type CatalogFields,
	type CatalogMutations,
	catalogAcknowledgements,
	catalogMutations,
	catalogRowBase,
	habitatTypeCommands,
} from './catalog-fields';
import { createCatalogRow, saveCatalogRow } from './catalog-writes';
import { canAttributeWrite } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for habitat types: create, save, deactivate, reactivate and delete. */
export function useHabitatTypeMutations(): CatalogMutations {
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
			is_active: fields.isActive,
		} satisfies HabitatType;
		await createCatalogRow(habitat_types(), habitatTypeCommands, row);
		return row.id;
	};

	const save = async (
		id: string,
		fields: CatalogFields,
		current: CatalogFields,
		acknowledgements: Acknowledgements,
	) => {
		const changes: Partial<HabitatType> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		if (fields.customSchema !== current.customSchema) {
			changes.custom_schema = fields.customSchema ?? null;
		}
		await saveCatalogRow(habitat_types(), habitatTypeCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
			acknowledgements: catalogAcknowledgements(CATALOG_SAVE_REFUSALS, acknowledgements, {
				renames: changes.name !== undefined,
				retires: !fields.isActive && current.isActive,
			}),
		});
	};

	return catalogMutations(habitat_types(), habitatTypeCommands, CATALOG_SAVE_REFUSALS, {
		create,
		save,
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	});
}
