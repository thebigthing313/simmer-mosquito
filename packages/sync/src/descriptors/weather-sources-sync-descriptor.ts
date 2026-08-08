import { createSyncDescriptor } from '../descriptor-factory.js';
import type { WeatherSourceRow } from '../index.js';

export const weatherSourcesSyncDescriptor = createSyncDescriptor<WeatherSourceRow>({
	id: 'weather_sources',
	table: 'weather_sources',
	endpointPath: '/sync/shapes/weather-sources',
	syncMode: 'eager',
	scope: 'organization-or-global',
	columns: [
		'id',
		'organizationId',
		// `geom` is a non-null Point, so the trigger-maintained centroid is the
		// station's own coordinate. Synced because the stations list draws them on
		// a map from these rows rather than from a tile route — there are tens of
		// stations, not thousands. Full geojson stays server-only.
		'lat',
		'lng',
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
