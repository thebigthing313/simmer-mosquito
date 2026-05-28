import { createSyncDescriptor } from '../descriptor-factory.js';
import type { FormulationInsecticideRow } from '../index.js';

export const formulationInsecticidesSyncDescriptor =
	createSyncDescriptor<FormulationInsecticideRow>({
		id: 'formulation_insecticides',
		table: 'formulation_insecticides',
		endpointPath: '/sync/shapes/formulation-insecticides',
		syncMode: 'eager',
		columns: [
			'id',
			'organizationId',
			'formulationId',
			'insecticideId',
			'ratio',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
		],
		getKey: (row) => row.id,
	});
