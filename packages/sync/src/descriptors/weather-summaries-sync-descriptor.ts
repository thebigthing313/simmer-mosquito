import { createSyncDescriptor } from '../descriptor-factory.js';
import type { WeatherSummaryRow } from '../index.js';

export const weatherSummariesSyncDescriptor = createSyncDescriptor<WeatherSummaryRow>({
	id: 'weather_summaries',
	table: 'weather_summaries',
	endpointPath: '/sync/shapes/weather-summaries',
	columns: [
		'id',
		'organizationId',
		'weatherSourceId',
		'startDate',
		'endDate',
		'temperatureMinF',
		'temperatureMaxF',
		'precipitationInches',
		'relativeHumidityMin',
		'relativeHumidityMax',
		'windSpeedMinMph',
		'windSpeedMaxMph',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
});
