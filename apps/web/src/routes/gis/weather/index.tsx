import { boundsFromCoordinates } from '@simmer-mosquito/mapping';
import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	useExplorerPanel,
} from '../../../components/explorer';
import { MapCanvas } from '../../../components/map';
import type { WeatherStation } from '../../../hooks/queries/use-weather-station';
import { useWeatherStations } from '../../../hooks/queries/use-weather-stations';
import {
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { weatherSourceTypeLabel } from './-weather-display';
import { WeatherStationMapCard } from './-weather-station-map-card';
import { StationStatusBadge } from './-weather-ui';

interface StationFilters {
	readonly search: string;
}

const STATION_FILTER_DEFAULTS: StationFilters = { search: '' };
const STATION_FILTER_CODECS: FilterCodecs<StationFilters> = { search: textParam };

export const Route = createFileRoute('/gis/weather/')({
	component: WeatherStationsRoute,
	validateSearch: searchValidator(STATION_FILTER_CODECS),
});

const WeatherIcon = iconRegistry.domains.weather.icon;
const RESULT_NOUN = { one: 'station', many: 'stations' };

/** A station whose synced centroid is usable as a map coordinate. */
interface PlottedStation {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
}

function WeatherStationsRoute() {
	// weatherSources is eager, so the list resolves without a fetch and the points
	// come off the same rows — there are tens of stations, not thousands, which is
	// why this draws GeoJSON rather than standing up a tile route.
	const { stations: rows } = useWeatherStations();

	const { filters: query, setFilters } = useSearchFilters(
		STATION_FILTER_DEFAULTS,
		STATION_FILTER_CODECS,
	);
	const search = query.search;
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const { input: searchInput, setInput: setSearch } = useDebouncedTextFilter(search, commitSearch);

	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const panel = useExplorerPanel();

	const stations = useMemo(() => {
		const term = search.trim().toLowerCase();
		// Already alphabetical off the query; only the search narrows it here.
		return rows.filter((station) =>
			term.length === 0
				? true
				: [station.name, station.sourceCode, weatherSourceTypeLabel(station.sourceType)].some(
						(part) => (part ?? '').toLowerCase().includes(term),
					),
		);
	}, [rows, search]);

	const plotted = useMemo(
		() =>
			stations.flatMap((station): PlottedStation[] => {
				const { id, latitude: lat, longitude: lng } = station;
				return typeof lat === 'number' && typeof lng === 'number' ? [{ id, lat, lng }] : [];
			}),
		[stations],
	);

	const geoJson = useMemo((): GeoJSON.GeoJSON | null => {
		if (plotted.length === 0) {
			return null;
		}
		return {
			type: 'FeatureCollection',
			features: plotted.map(
				(station): GeoJSON.Feature => ({
					type: 'Feature',
					id: station.id,
					properties: { id: station.id },
					geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
				}),
			),
		};
	}, [plotted]);

	// The points come from local rows, so the camera frames the filtered set from
	// the list rather than asking the server for an extent.
	const bounds = useMemo(() => boundsFromCoordinates(plotted), [plotted]);

	// Fly to a station when it becomes focused, from either the list or the map.
	const focused = plotted.find((station) => station.id === focusedId) ?? null;
	useEffect(() => {
		if (map === null || focused === null) {
			return;
		}
		map.flyTo({
			center: [focused.lng, focused.lat],
			zoom: Math.max(map.getZoom(), 12),
			duration: 600,
		});
	}, [map, focused]);

	const activeFilterCount = search.trim().length > 0 ? 1 : 0;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<SearchField
						label="Search weather stations"
						onChange={setSearch}
						placeholder="Search stations…"
						value={searchInput}
					/>

					{activeFilterCount > 0 ? (
						<ActiveFilterBar onClearAll={() => commitSearch('')}>
							<FilterChip label={`Search: ${search}`} onRemove={() => commitSearch('')} />
						</ActiveFilterBar>
					) : null}
				</>
			}
			heading={{
				title: 'Weather Stations',
				icon: WeatherIcon,
				total: stations.length,
				isLoading: false,
				noun: RESULT_NOUN,
				create: { to: '/gis/weather/create', label: 'Add Station', minimum: 'manager' },
			}}
			onResetFilters={() => commitSearch('')}
			map={
				<>
					<MapCanvas
						contextMenu={{}}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData={bounds}
						geoJson={geoJson}
						geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: setFocusedId }}
						inset={panel.inset}
						onMapReady={setMap}
						searchWidth={panel.width}
					/>
					{focusedId === null ? null : (
						<WeatherStationMapCard
							id={focusedId}
							inset={panel.inset}
							onClose={() => setFocusedId(null)}
						/>
					)}
				</>
			}
			panel={panel}
			results={{
				rows: stations,
				emptyTitle: activeFilterCount > 0 ? 'No stations match' : 'No weather stations',
				emptyDescription:
					activeFilterCount > 0
						? 'Try a different name or code.'
						: 'Add a station to start recording readings against it.',
				renderRow: (station) => (
					<StationRowItem
						isFocused={station.id === focusedId}
						key={station.id}
						onFocus={() => setFocusedId(station.id)}
						station={station}
					/>
				),
			}}
		/>
	);
}

function StationRowItem({
	station,
	isFocused,
	onFocus,
}: {
	readonly station: WeatherStation;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
}) {
	const hasPoint = typeof station.latitude === 'number' && typeof station.longitude === 'number';
	const detail = [weatherSourceTypeLabel(station.sourceType), station.sourceCode]
		.filter((part): part is string => (part ?? '').length > 0)
		.join(' · ');

	return (
		<ExplorerRow
			badges={<StationStatusBadge isActive={station.isActive} />}
			detailLabel={`View details for ${station.name}`}
			detailLink={{ to: '/gis/weather/$id', params: { id: station.id } }}
			isSelected={isFocused}
			// A station with no synced centroid has nothing to show on the map, so the
			// row stays a link to its record rather than offering a camera move.
			onSelect={hasPoint ? onFocus : undefined}
			selectLabel={`Show ${station.name} on the map`}
			subtitle={detail}
			title={station.name}
			titleLink={{ to: '/gis/weather/$id', params: { id: station.id } }}
		/>
	);
}
