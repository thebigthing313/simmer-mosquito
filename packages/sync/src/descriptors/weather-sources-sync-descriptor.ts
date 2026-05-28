import { createSyncDescriptor } from '../descriptor-factory.js';
import type { WeatherSourceRow } from '../index.js';

export const weatherSourcesSyncDescriptor = createSyncDescriptor<WeatherSourceRow>({
	id: 'weather_sources',
	table: 'weather_sources',
	endpointPath: '/sync/shapes/weather-sources',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'sourceType',
		'sourceName',
		'sourceCode',
		'providerSourceId',
		'isActive',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
