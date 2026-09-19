import type { InsecticideBatch } from '@simmer-mosquito/sync';
import { insecticide_batches } from '../../lib/collections/insecticide_batches';
import {
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import { canAttributeWrite, newRecordId, optimisticStamp } from './shared';
import {
	batchCommands,
	type InsecticideBatchFields,
	type InsecticideBatchMutations,
} from './use-insecticide-mutations';
import { useWriterIdentity } from './use-writer-identity';
/** The five catalog writes for insecticide batches: create, save, deactivate, reactivate and delete. */
export function useInsecticideBatchMutations(): InsecticideBatchMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = async (fields: InsecticideBatchFields) => {
		if (organizationId === null) {
			throw new Error('Your profile is still loading.');
		}
		const now = optimisticStamp();
		const row = {
			id: newRecordId(),
			organization_id: organizationId,
			insecticide_id: fields.insecticideId,
			batch_name: fields.batchName,
			is_active: fields.isActive,
			created_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			created_at: now,
			updated_at: now,
		} satisfies InsecticideBatch;
		await createCatalogRow(insecticide_batches(), batchCommands, row);
		return row.id;
	};

	const save = async (
		id: string,
		fields: InsecticideBatchFields,
		current: InsecticideBatchFields,
		acknowledgements: Readonly<Record<string, boolean>> = {},
	) => {
		// Only the name: `updateInsecticideBatch` does not move a batch between
		// products, because an application already recorded against it was made
		// with what was in that tin.
		const changes: Partial<InsecticideBatch> = {};
		if (fields.batchName !== current.batchName) {
			changes.batch_name = fields.batchName;
		}
		await saveCatalogRow(insecticide_batches(), batchCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
			// The name is the whole of what an application's batch link reads back
			// under, so retiring a batch on its own answers nothing.
			...(changes.batch_name === undefined
				? {}
				: {
						acknowledgements: {
							acknowledgedHistoricalBatchLabelChange:
								acknowledgements.acknowledgedHistoricalBatchLabelChange === true,
						},
					}),
		});
	};

	return {
		create,
		save,
		setActive: (id, isActive) =>
			setCatalogRowActive(insecticide_batches(), batchCommands, id, isActive),
		remove: (id) => deleteCatalogRow(insecticide_batches(), batchCommands, id),
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	};
}
