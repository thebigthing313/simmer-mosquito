/**
 * One weather station.
 *
 * The only map card in the app that needs no join and no HTTP: a station's
 * geometry is a single synced point, and it names nothing else. It is a hook
 * rather than an inline query so the surface reads through the same seam as the
 * rest, and so the camelCase boundary lands in one place.
 *
 * Stations are shared rather than agency-owned — `organization_id` is nullable,
 * because the NWS ones belong to nobody — so the shape carries both this
 * agency's own stations and the public ones it reads.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { weather_sources } from '../../lib/collections/weather_sources';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export type WeatherSourceType = 'organization' | 'nws';

export interface WeatherStation {
	readonly id: string;
	readonly name: string;
	readonly sourceType: WeatherSourceType;
	readonly sourceCode: string | null;
	readonly providerSourceId: string | null;
	readonly isActive: boolean;
	/** `null` on a shared station — an NWS one belongs to no agency. */
	readonly organizationId: string | null;
	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	/** Agency-specific notes. Round-tripped by the edit form. */
	readonly metadata: unknown;
}

export function useWeatherStation(stationId: string | null): {
	readonly station: WeatherStation | undefined;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ source: weather_sources })
					.where(({ source }) => eq(source.id, stationId ?? unmatchableId))
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
		},
		[stationId],
	);

	return { station: result.data[0], isReady: result.isReady };
}
