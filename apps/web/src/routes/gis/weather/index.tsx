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

	const {
		filters: query,
		setFilters,
		activeCount: activeFilterCount,
	} = useSearchFilters(STATION_FILTER_DEFAULTS, STATION_FILTER_CODECS);
	const search = query.search;
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const { input: searchInput, setInput: setSearch } = useDebouncedTextFilter(search, commitSearch);

	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const panel = useExplorerPanel();

	// Already alphabetical off the query; only the search narrows it here.
	const stations = useMemo(() => matchingStations(rows, search), [rows, search]);
	const plotted = useMemo(() => plottedStations(stations), [stations]);
	const geoJson = useMemo(() => stationFeatures(plotted), [plotted]);

	// The points come from local rows, so the camera frames the filtered set from
	// the list rather than asking the server for an extent.
	const bounds = useMemo(() => boundsFromCoordinates(plotted), [plotted]);

	useFlyToStation(map, plotted.find((station) => station.id === focusedId) ?? null);

	const isFiltered = search.trim().length > 0;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<StationFilters
					onClear={() => commitSearch('')}
					onChange={setSearch}
					search={search}
					value={searchInput}
				/>
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
				<StationMap
					bounds={bounds}
					focusedId={focusedId}
					geoJson={geoJson}
					onMapReady={setMap}
					onSelect={setFocusedId}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				rows: stations,
				...emptyState(isFiltered),
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

/** What an empty rail says, which depends on whether a filter emptied it. */
function emptyState(isFiltered: boolean): {
	readonly emptyTitle: string;
	readonly emptyDescription: string;
} {
	return isFiltered
		? { emptyTitle: 'No stations match', emptyDescription: 'Try a different name or code.' }
		: {
				emptyTitle: 'No weather stations',
				emptyDescription: 'Add a station to start recording readings against it.',
			};
}

/** Fly to a station when it becomes focused, from either the list or the map. */
function useFlyToStation(map: MapboxMap | null, focused: PlottedStation | null) {
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
}

/** The map, and the card for whichever station is focused. */
function StationMap({
	bounds,
	focusedId,
	geoJson,
	onMapReady,
	onSelect,
	panel,
}: {
	readonly bounds: ReturnType<typeof boundsFromCoordinates>;
	readonly focusedId: string | null;
	readonly geoJson: GeoJSON.GeoJSON | null;
	readonly onMapReady: (map: MapboxMap) => void;
	readonly onSelect: (id: string | null) => void;
	readonly panel: ReturnType<typeof useExplorerPanel>;
}) {
	return (
		<>
			<MapCanvas
				contextMenu={{}}
				controls={{ layers: false, measure: true, readout: true }}
				fitToData={bounds}
				geoJson={geoJson}
				geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: onSelect }}
				inset={panel.inset}
				onMapReady={onMapReady}
				searchWidth={panel.width}
			/>
			{focusedId === null ? null : (
				<WeatherStationMapCard id={focusedId} inset={panel.inset} onClose={() => onSelect(null)} />
			)}
		</>
	);
}

/** The stations whose name, code or source type carries the search term. */
function matchingStations(
	rows: readonly WeatherStation[],
	search: string,
): readonly WeatherStation[] {
	const term = search.trim().toLowerCase();
	if (term.length === 0) {
		return rows;
	}
	return rows.filter((station) =>
		[station.name, station.sourceCode, weatherSourceTypeLabel(station.sourceType)].some((part) =>
			(part ?? '').toLowerCase().includes(term),
		),
	);
}

/** The ones that have somewhere to be drawn. */
function plottedStations(stations: readonly WeatherStation[]): readonly PlottedStation[] {
	return stations.flatMap((station): PlottedStation[] => {
		const { id, latitude: lat, longitude: lng } = station;
		return typeof lat === 'number' && typeof lng === 'number' ? [{ id, lat, lng }] : [];
	});
}

function stationFeatures(plotted: readonly PlottedStation[]): GeoJSON.GeoJSON | null {
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
}

/** The one control this surface filters by, and the chip that undoes it. */
function StationFilters({
	onChange,
	onClear,
	search,
	value,
}: {
	readonly onChange: (next: string) => void;
	readonly onClear: () => void;
	readonly search: string;
	readonly value: string;
}) {
	return (
		<>
			<SearchField
				label="Search weather stations"
				onChange={onChange}
				placeholder="Search stations…"
				value={value}
			/>
			{search.trim().length === 0 ? null : (
				<ActiveFilterBar onClearAll={onClear}>
					<FilterChip label={`Search: ${search}`} onRemove={onClear} />
				</ActiveFilterBar>
			)}
		</>
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
