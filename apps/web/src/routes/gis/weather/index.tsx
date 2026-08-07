import { boundsFromCoordinates } from '@simmer-mosquito/mapping';
import type { WeatherSourceRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { ChevronRightIcon, iconRegistry, SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import {
	type FilterCodecs,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
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
	const { rows } = useCollectionRows<WeatherSourceRow>(webCollections.weatherSources);

	const { filters: query, setFilters } = useSearchFilters(
		STATION_FILTER_DEFAULTS,
		STATION_FILTER_CODECS,
	);
	const search = query.search;
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const { input: searchInput, setInput: setSearch } = useDebouncedTextFilter(search, commitSearch);

	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

	const stations = useMemo(() => {
		const term = search.trim().toLowerCase();
		return [...rows]
			.filter((station) =>
				term.length === 0
					? true
					: [
							station.sourceName,
							station.sourceCode,
							weatherSourceTypeLabel(station.sourceType),
						].some((part) => (part ?? '').toLowerCase().includes(term)),
			)
			.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
	}, [rows, search]);

	const plotted = useMemo(
		() =>
			stations.flatMap((station): PlottedStation[] => {
				const { id, lat, lng } = station;
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

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false, measure: true }}
						fitToData={bounds}
						geoJson={geoJson}
						geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: setFocusedId }}
						onMapReady={setMap}
					/>
					{focusedId === null ? null : (
						<WeatherStationMapCard id={focusedId} onClose={() => setFocusedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
							Weather Stations
						</h1>
						<p className="m-0 text-muted-foreground text-sm">
							Stations feeding the agency's surveillance and control records.
						</p>
					</div>
					<div className="relative">
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							aria-label="Search weather stations"
							className="pl-9"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search stations…"
							type="search"
							value={searchInput}
						/>
					</div>
				</div>

				{stations.length === 0 ? (
					<StationsEmpty hasFilter={search.trim().length > 0} />
				) : (
					<ul className="min-h-0 flex-1 overflow-y-auto p-2">
						{stations.map((station) => (
							<StationRowItem
								isFocused={station.id === focusedId}
								key={station.id}
								onFocus={() => setFocusedId(station.id)}
								station={station}
							/>
						))}
					</ul>
				)}
			</div>
		</MapSplitPage>
	);
}

function StationRowItem({
	station,
	isFocused,
	onFocus,
}: {
	readonly station: WeatherSourceRow;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
}) {
	const hasPoint = typeof station.lat === 'number' && typeof station.lng === 'number';
	const detail = [weatherSourceTypeLabel(station.sourceType), station.sourceCode]
		.filter((part): part is string => (part ?? '').length > 0)
		.join(' · ');

	return (
		<li
			className={cn(
				'group flex items-center gap-1.5 rounded-md py-1.5 pr-1 pl-2',
				isFocused ? 'bg-primary/8' : 'hover:bg-muted/50',
			)}
		>
			<button
				className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
				disabled={!hasPoint}
				onClick={onFocus}
				title={hasPoint ? 'Show on the Map' : 'This station has no synced coordinates'}
				type="button"
			>
				<span className="block truncate font-medium text-foreground text-sm hover:text-primary">
					{station.sourceName}
				</span>
				<span className="block text-muted-foreground text-xs leading-snug">{detail}</span>
			</button>
			<StationStatusBadge isActive={station.isActive} />
			<Link
				aria-label={`View details for ${station.sourceName}`}
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: station.id }}
				title="View Station Details"
				to="/gis/weather/$id"
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Link>
		</li>
	);
}

function StationsEmpty({ hasFilter }: { readonly hasFilter: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<WeatherIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasFilter ? 'No Stations Match' : 'No Weather Stations'}</EmptyTitle>
					<EmptyDescription>
						{hasFilter
							? 'Try a different name or code.'
							: "Stations appear here once they're connected for your agency."}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
