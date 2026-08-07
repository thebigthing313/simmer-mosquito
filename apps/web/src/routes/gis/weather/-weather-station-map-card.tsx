import type { WeatherSourceRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../../components/map/map-card';
import { webCollections } from '../../../sync/webCollections';
import { weatherSourceTypeLabel } from './-weather-display';
import { StationStatusBadge } from './-weather-ui';

const WeatherIcon = iconRegistry.domains.weather.icon;

/**
 * The map focus card for a weather station. Self-contained: given the station id
 * it resolves the row off the eager weather-sources collection — coordinates
 * included, since a station's geometry is a single synced point — and renders the
 * shared {@link MapCard}.
 */
export function WeatherStationMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ source: webCollections.weatherSources })
				.where(({ source }) => eq(source.id, id))
				.findOne(),
		[id],
	);
	const station = result.data as WeatherSourceRow | undefined;

	if (station === undefined) {
		return (
			<MapCard className="max-w-[420px]" onClose={onClose} title="Weather Station">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const { lat, lng } = station;

	return (
		<MapCard
			badges={<StationStatusBadge isActive={station.isActive} />}
			className="max-w-[420px]"
			eyebrow={<MapCardEyebrow type="Weather station" />}
			onClose={onClose}
			title={station.sourceName}
			viewDetailLink={(content) => (
				<Link params={{ id: station.id }} to="/gis/weather/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={WeatherIcon}>
					{weatherSourceTypeLabel(station.sourceType)}
					{station.sourceCode === null ? null : ` · ${station.sourceCode}`}
				</MapCardDetail>
				{typeof lat !== 'number' || typeof lng !== 'number' ? null : (
					<MapCardDetail icon={LocateFixedIcon} mono>
						{coordinateLabel({ lat, lng })}
					</MapCardDetail>
				)}
			</div>
		</MapCard>
	);
}
