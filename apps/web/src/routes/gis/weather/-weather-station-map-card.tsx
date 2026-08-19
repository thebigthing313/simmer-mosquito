import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../../components/map/map-card';
import { useWeatherStation } from '../../../hooks/queries/use-weather-station';
import { weatherSourceTypeLabel } from './-weather-display';
import { StationStatusBadge } from './-weather-ui';

const WeatherIcon = iconRegistry.domains.weather.icon;

/**
 * The map focus card for a weather station. The one card that needs no join and
 * no HTTP: a station's geometry is a single synced point and it names nothing
 * else, so {@link useWeatherStation} is the whole read.
 */
export function WeatherStationMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const { station } = useWeatherStation(id);

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

	const { latitude: lat, longitude: lng } = station;

	return (
		<MapCard
			badges={<StationStatusBadge isActive={station.isActive} />}
			className="max-w-[420px]"
			eyebrow={<MapCardEyebrow type="Weather station" />}
			onClose={onClose}
			title={station.name}
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
