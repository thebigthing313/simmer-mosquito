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
	SegmentedFilter,
	useExplorerPanel,
} from '../../../components/explorer';
import {
	MapCanvas,
	type MapLegendEntry,
	WEATHER_STATION_STATUS_COLORS,
} from '../../../components/map';
import type { WeatherStation } from '../../../hooks/queries/use-weather-station';
import { useWeatherStations } from '../../../hooks/queries/use-weather-stations';
import {
	choiceParam,
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import type { StatusFilter } from './-legend';
import { weatherStationLegend } from './-legend';
import { weatherSourceTypeLabel } from './-weather-display';
import { WeatherStationMapCard } from './-weather-station-map-card';

interface StationFilters {
	readonly search: string;
	readonly status: StatusFilter;
}

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'inactive'];

/*
 * Active by default, matching Traps. A retired station keeps its readings and
 * stays reportable, so it is history rather than work, and a map that opens on
 * every station an agency ever ran is a map nobody can read.
 */
const STATION_FILTER_DEFAULTS: StationFilters = { search: '', status: 'active' };
const STATION_FILTER_CODECS: FilterCodecs<StationFilters> = {
	search: textParam,
	status: choiceParam(STATUS_VALUES, STATION_FILTER_DEFAULTS.status),
};

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

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
	readonly isActive: boolean;
}

function WeatherStationsRoute() {
	// weatherSources is eager, so the list resolves without a fetch and the points
	// come off the same rows — there are tens of stations, not thousands, which is
	// why this draws GeoJSON rather than standing up a tile route.
	const { stations: rows } = useWeatherStations();

	const filters = useStationFilters();
	const { search, status, activeFilterCount } = filters;

	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const panel = useExplorerPanel();

	// Already alphabetical off the query; the search and the status narrow it here.
	const stations = useMemo(() => matchingStations(rows, search, status), [rows, search, status]);
	const plotted = useMemo(() => plottedStations(stations), [stations]);
	const geoJson = useMemo(() => stationFeatures(plotted), [plotted]);
	const legend = useMemo(() => weatherStationLegend(status), [status]);

	// The points come from local rows, so the camera frames the filtered set from
	// the list rather than asking the server for an extent.
	const bounds = useMemo(() => boundsFromCoordinates(plotted), [plotted]);

	useFlyToStation(map, plotted.find((station) => station.id === focusedId) ?? null);

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={<StationFilters {...filters} />}
			heading={{
				title: 'Weather Stations',
				icon: WeatherIcon,
				total: stations.length,
				isLoading: false,
				noun: RESULT_NOUN,
				create: { to: '/gis/weather/create', label: 'Add Station', minimum: 'manager' },
			}}
			onResetFilters={filters.onClearAll}
			map={
				<StationMap
					bounds={bounds}
					focusedId={focusedId}
					geoJson={geoJson}
					legend={legend}
					onMapReady={setMap}
					onSelect={setFocusedId}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				rows: stations,
				// Whether a filter emptied the rail, or the agency has no stations. The
				// unfiltered count answers it exactly, and the filter count does not:
				// Status defaults to Active and counts nothing, so an agency whose
				// stations are all retired would be told to add its first one.
				...emptyState(rows.length > 0),
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
		? {
				emptyTitle: 'No stations match',
				emptyDescription: 'Loosen the filters, or search a different name or code.',
			}
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
	legend,
	onMapReady,
	onSelect,
	panel,
}: {
	readonly bounds: ReturnType<typeof boundsFromCoordinates>;
	readonly focusedId: string | null;
	readonly geoJson: GeoJSON.GeoJSON | null;
	readonly legend: readonly MapLegendEntry[];
	readonly onMapReady: (map: MapboxMap) => void;
	readonly onSelect: (id: string | null) => void;
	readonly panel: ReturnType<typeof useExplorerPanel>;
}) {
	return (
		<>
			<MapCanvas
				contextMenu={{}}
				controls={{ measure: true, readout: true }}
				fitToData={bounds}
				geoJson={geoJson}
				geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: onSelect }}
				inset={panel.inset}
				legend={legend}
				onMapReady={onMapReady}
				searchWidth={panel.width}
			/>
			{focusedId === null ? null : (
				<WeatherStationMapCard id={focusedId} inset={panel.inset} onClose={() => onSelect(null)} />
			)}
		</>
	);
}

/** The stations the status admits whose name, code or source type carries the term. */
function matchingStations(
	rows: readonly WeatherStation[],
	search: string,
	status: StatusFilter,
): readonly WeatherStation[] {
	const term = search.trim().toLowerCase();
	return rows.filter((station) => {
		if (status !== 'all' && station.isActive !== (status === 'active')) {
			return false;
		}
		return (
			term.length === 0 ||
			[station.name, station.sourceCode, weatherSourceTypeLabel(station.sourceType)].some((part) =>
				(part ?? '').toLowerCase().includes(term),
			)
		);
	});
}

/** The ones that have somewhere to be drawn. */
function plottedStations(stations: readonly WeatherStation[]): readonly PlottedStation[] {
	return stations.flatMap((station): PlottedStation[] => {
		const { id, latitude: lat, longitude: lng, isActive } = station;
		return typeof lat === 'number' && typeof lng === 'number' ? [{ id, lat, lng, isActive }] : [];
	});
}

/**
 * The points, each carrying the colour it paints.
 *
 * The overlay's circle layer reads a feature's own `color` and falls back to the
 * shared green, so painting by status is a property on the feature rather than a
 * new layer or a tile route. `id` is separate from the feature id because Mapbox
 * does not keep a domain UUID as the native feature id on a GeoJSON source, and
 * the selection filter compares the property.
 */
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
				properties: { id: station.id, color: stationColor(station.isActive) },
				geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
			}),
		),
	};
}

function stationColor(isActive: boolean): string {
	return isActive ? WEATHER_STATION_STATUS_COLORS.active : WEATHER_STATION_STATUS_COLORS.inactive;
}

/**
 * The filter state, on the URL, so a shared link and Back out of a station both
 * land on the list the operator had narrowed to.
 */
function useStationFilters(): StationFilterState {
	const {
		filters: query,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(STATION_FILTER_DEFAULTS, STATION_FILTER_CODECS);
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const {
		input: value,
		setInput: onChange,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(query.search, commitSearch);

	// Both halves: the field the operator is looking at, and the committed term on
	// the URL that is actually cutting the list.
	const onClearSearch = useCallback(() => {
		clearSearchInput();
		commitSearch('');
	}, [clearSearchInput, commitSearch]);
	const onClearAll = useCallback(() => {
		clearSearchInput();
		reset();
	}, [clearSearchInput, reset]);

	return {
		activeFilterCount,
		onChange,
		onClearAll,
		onClearSearch,
		onStatusChange: useCallback((next: StatusFilter) => setFilters({ status: next }), [setFilters]),
		search: query.search,
		status: query.status,
		value,
	};
}

interface StationFilterState {
	readonly activeFilterCount: number;
	readonly onChange: (next: string) => void;
	readonly onClearAll: () => void;
	readonly onClearSearch: () => void;
	readonly onStatusChange: (next: StatusFilter) => void;
	readonly search: string;
	readonly status: StatusFilter;
	/** The search box's own value, which runs ahead of the committed term. */
	readonly value: string;
}

/** The two controls this surface filters by, and the chips that undo them. */
function StationFilters({
	activeFilterCount,
	onChange,
	onClearAll,
	onClearSearch,
	onStatusChange,
	search,
	status,
	value,
}: StationFilterState) {
	return (
		<>
			<SearchField
				label="Search weather stations"
				onChange={onChange}
				placeholder="Search stations…"
				value={value}
			/>

			<SegmentedFilter
				label="Status"
				onChange={onStatusChange}
				options={STATUS_OPTIONS}
				value={status}
			/>

			{activeFilterCount > 0 ? (
				<ActiveFilterBar onClearAll={onClearAll}>
					{status === 'active' ? null : (
						<FilterChip
							label={`Status: ${status === 'all' ? 'All' : 'Inactive'}`}
							onRemove={() => onStatusChange('active')}
						/>
					)}
					{search.trim().length === 0 ? null : (
						<FilterChip label={`Search: ${search}`} onRemove={onClearSearch} />
					)}
				</ActiveFilterBar>
			) : null}
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
			detailLabel={`View details for ${station.name}`}
			detailLink={{ to: '/gis/weather/$id', params: { id: station.id } }}
			isSelected={isFocused}
			// A station with no synced centroid has nothing to show on the map, so the
			// row stays a link to its record rather than offering a camera move.
			onSelect={hasPoint ? onFocus : undefined}
			selectLabel={`Show ${station.name} on the map`}
			subtitle={detail}
			/*
			 * The dot is the status now, so it has to be the colour the map paints
			 * this station. The Active/Inactive pill it replaces said the same thing
			 * twice once the map started colouring by status.
			 */
			swatch={{
				color: stationColor(station.isActive),
				label: station.isActive ? 'Active' : 'Inactive',
			}}
			title={station.name}
			titleLink={{ to: '/gis/weather/$id', params: { id: station.id } }}
		/>
	);
}
