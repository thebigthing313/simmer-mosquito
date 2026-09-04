/**
 * Every weather station this agency can read, by name.
 *
 * The stations list, which draws its points as GeoJSON off these same rows rather
 * than standing up a tile route: there are tens of stations, not thousands, and
 * the shape is eager, so the list and the map resolve together without a fetch.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { weather_sources } from '../../lib/collections/weather_sources';
import type { WeatherStation } from './use-weather-station';

export function useWeatherStations(): {
	readonly stations: readonly WeatherStation[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ source: weather_sources() })
				.orderBy(({ source }) => source.source_name, 'asc')
				.select(({ source }) => ({
					id: source.id,
					name: source.source_name,
					sourceType: source.source_type,
					sourceCode: source.source_code,
					providerSourceId: source.provider_source_id,
					isActive: source.is_active,
					organizationId: source.organization_id,
					latitude: source.lat,
					longitude: source.lng,
					geometryKind: source.geom_type,
					metadata: source.metadata,
				})),
		[],
	);

	return { stations: result.data, isReady: result.isReady };
}
