import { createSyncDescriptor } from '../descriptor-factory.js';
import type { WeatherSourceSubscriptionRow } from '../index.js';

export const weatherSourceSubscriptionsSyncDescriptor =
	createSyncDescriptor<WeatherSourceSubscriptionRow>({
		id: 'weather_source_subscriptions',
		table: 'weather_source_subscriptions',
		endpointPath: '/sync/shapes/weather-source-subscriptions',
		syncMode: 'on-demand',
		columns: [
			'id',
			'organizationId',
			'weatherSourceId',
			'isActive',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
		],
		getKey: (row) => row.id,
	});
