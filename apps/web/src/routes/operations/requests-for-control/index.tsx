import { boundsFromCoordinates } from '@simmer-mosquito/mapping';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	activeDatePresetId,
	type DatePreset,
	DateRangeFilter,
	datePresetRange,
} from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	type FilterOption,
	MultiSelectFilter,
	SegmentedFilter,
	useControlMethodNames,
	useExplorerPanel,
	usePersonnelOptions,
} from '../../../components/explorer';
import { MapCanvas } from '../../../components/map';
import {
	CONTROL_TYPES,
	controlTypeLabel,
	formatRequestedAt,
	type RequestListing,
	requestDisplayName,
	requestStatus,
} from '../../../hooks/queries/operations-view';
import { useRequestedControlActions } from '../../../hooks/queries/use-requested-control-actions';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { addCalendarDays, todayInTimeZone } from '../../../lib/local-date';
import {
	choiceParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { RequestStatusBadge } from '../-operations-display';

const RequestIcon = iconRegistry.domains.controlOperations.icon;
const RESULT_NOUN = { one: 'request', many: 'requests' };

type StatusFilter = 'all' | 'open' | 'resolved';

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'open', label: 'Open' },
	{ value: 'resolved', label: 'Resolved' },
];

const CONTROL_TYPE_OPTIONS: readonly FilterOption[] = CONTROL_TYPES.map((controlType) => ({
	id: controlType,
	label: controlTypeLabel(controlType),
}));

interface RequestFilters {
	readonly from: string;
	readonly to: string;
	readonly status: StatusFilter;
	readonly types: ReadonlySet<string>;
	readonly people: ReadonlySet<string>;
}

// `open` is the default and so stays out of the URL: the queue is read to find
// work that still needs doing, and a link that carries no status should land on
// that rather than on everything ever raised.
const FILTER_CODECS: FilterCodecs<RequestFilters> = {
	from: dateParam,
	to: dateParam,
	status: choiceParam(['all', 'open', 'resolved'], 'open'),
	types: idSetParam,
	people: idSetParam,
};

export const Route = createFileRoute('/operations/requests-for-control/')({
	component: RequestsForControlRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

// A request queue is read backwards from today: the default window is the last
// quarter, long enough that an unresolved request raised weeks ago is still in
// view without the operator touching a filter.
const DEFAULT_WINDOW_DAYS = 90;

function RequestsForControlRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const filterDefaults = useMemo<RequestFilters>(
		() => ({
			from: addCalendarDays(today, -(DEFAULT_WINDOW_DAYS - 1)),
			to: today,
			status: 'open',
			types: new Set(),
			people: new Set(),
		}),
		[today],
	);
	const {
		filters,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(filterDefaults, FILTER_CODECS, DATE_RANGE_COUNTING);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();
	const [map, setMap] = useState<MapboxMap | null>(null);

	const { requests, isLoading } = useRequestedControlActions(filters.from, filters.to);
	const { options: personnelOptions, nameById } = usePersonnelOptions();
	const methodNameById = useControlMethodNames();

	const visible = useMemo(
		() => requests.filter((request) => matchesFilters(request, filters)),
		[requests, filters],
	);

	const mapped = useMemo(() => mappable(visible), [visible]);
	const geoJson = useMemo(() => requestFeatures(mapped), [mapped]);
	// The points come from local rows, so the camera frames the filtered set from
	// the list rather than asking the server for an extent.
	const bounds = useMemo(
		() => boundsFromCoordinates(mapped.map((request) => ({ lng: request.lng, lat: request.lat }))),
		[mapped],
	);
	useFlyToRequest(
		map,
		selectedId === null ? null : (visible.find((r) => r.id === selectedId) ?? null),
	);

	const dateRange = useRequestDateRange(filters, setFilters, today);

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<RequestControlFilters
					activeFilterCount={activeFilterCount}
					dateRange={dateRange}
					filters={filters}
					nameById={nameById}
					onClearAll={reset}
					personnelOptions={personnelOptions}
					setFilters={setFilters}
				/>
			}
			heading={{
				title: 'Requests for Control',
				icon: RequestIcon,
				total: visible.length,
				isLoading,
				noun: RESULT_NOUN,
				create: { to: '/operations/requests-for-control/create', label: 'New Request for Control' },
			}}
			onResetFilters={reset}
			map={
				<MapCanvas
					contextMenu={{}}
					controls={{ measure: true, readout: true }}
					fitToData={bounds}
					geoJson={geoJson}
					geoJsonInteraction={{ selectedId, onSelectFeature: setSelectedId }}
					inset={panel.inset}
					onMapReady={setMap}
					searchWidth={panel.width}
				/>
			}
			panel={panel}
			results={{
				rows: visible,
				emptyTitle: 'No requests in range',
				emptyDescription:
					'Widen the time window or loosen the filters to bring requests into range.',
				skeletonClassName: 'h-[68px]',
				renderRow: (request) => (
					<RequestRow
						key={request.id}
						methodNameById={methodNameById}
						onSelect={setSelectedId}
						personNameById={nameById}
						request={request}
						selectedId={selectedId}
					/>
				),
			}}
		/>
	);
}

/** A name from a catalog, for a column that may not point at one. */
function lookup(names: ReadonlyMap<string, string>, id: string | null): string | null {
	return id === null ? null : (names.get(id) ?? null);
}

/** The requests that have somewhere to be drawn. */
function mappable(requests: readonly RequestListing[]): readonly RequestListing[] {
	return requests.filter((request) => Number.isFinite(request.lat) && Number.isFinite(request.lng));
}

function requestFeatures(mapped: readonly RequestListing[]): GeoJSON.GeoJSON | null {
	const features = mapped.map(
		(request): GeoJSON.Feature => ({
			type: 'Feature',
			id: request.id,
			properties: { id: request.id },
			geometry: { type: 'Point', coordinates: [request.lng, request.lat] },
		}),
	);
	return features.length === 0 ? null : { type: 'FeatureCollection', features };
}

/** Fly to a request when it becomes selected, from either the list or the map. */
function useFlyToRequest(map: MapboxMap | null, selected: RequestListing | null) {
	useEffect(() => {
		if (map === null || selected === null) {
			return;
		}
		map.flyTo({
			center: [selected.lng, selected.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 600,
		});
	}, [map, selected]);
}

/**
 * The date range, and the two handlers that keep it in order.
 *
 * Moving one end past the other drags the other with it rather than leaving an
 * empty range on the URL.
 */
function useRequestDateRange(
	filters: RequestFilters,
	setFilters: (patch: Partial<RequestFilters>) => void,
	today: string,
) {
	const onFromChange = useCallback(
		(next: string) => {
			setFilters({
				from: next,
				...(next !== '' && filters.to !== '' && next > filters.to ? { to: next } : {}),
			});
		},
		[setFilters, filters.to],
	);
	const onToChange = useCallback(
		(next: string) => {
			setFilters({
				to: next,
				...(next !== '' && filters.from !== '' && next < filters.from ? { from: next } : {}),
			});
		},
		[setFilters, filters.from],
	);
	const onApplyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setFilters({ from: range.from, to: range.to });
		},
		[setFilters, today],
	);
	const activePresetId = useMemo(
		() => activeDatePresetId(filters.from, filters.to, today),
		[filters.from, filters.to, today],
	);
	return {
		activePresetId,
		from: filters.from,
		onApplyPreset,
		onFromChange,
		onToChange,
		to: filters.to,
		today,
	};
}

/** The filter card's contents, and the chips that undo what is set. */
function RequestControlFilters({
	activeFilterCount,
	dateRange,
	filters,
	nameById,
	onClearAll,
	personnelOptions,
	setFilters,
}: {
	readonly activeFilterCount: number;
	readonly dateRange: ReturnType<typeof useRequestDateRange>;
	readonly filters: RequestFilters;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onClearAll: () => void;
	readonly personnelOptions: ReturnType<typeof usePersonnelOptions>['options'];
	readonly setFilters: (patch: Partial<RequestFilters>) => void;
}) {
	return (
		<>
			<DateRangeFilter {...dateRange} />

			<SegmentedFilter
				label="Status"
				onChange={(next: StatusFilter) => setFilters({ status: next })}
				options={STATUS_OPTIONS}
				value={filters.status}
			/>

			<FilterGrid>
				<MultiSelectFilter
					empty="No control types"
					label="Control type"
					onChange={(next) => setFilters({ types: next })}
					options={CONTROL_TYPE_OPTIONS}
					selected={filters.types}
				/>
				<MultiSelectFilter
					empty="No profiles"
					label="Requested by"
					onChange={(next) => setFilters({ people: next })}
					options={personnelOptions}
					selected={filters.people}
				/>
			</FilterGrid>

			<RequestControlChips
				activeFilterCount={activeFilterCount}
				filters={filters}
				nameById={nameById}
				onClearAll={onClearAll}
				setFilters={setFilters}
			/>
		</>
	);
}

/** What is currently narrowing the list, each chip removing its own filter. */
function RequestControlChips({
	activeFilterCount,
	filters,
	nameById,
	onClearAll,
	setFilters,
}: {
	readonly activeFilterCount: number;
	readonly filters: RequestFilters;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onClearAll: () => void;
	readonly setFilters: (patch: Partial<RequestFilters>) => void;
}) {
	if (activeFilterCount === 0) {
		return null;
	}
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
			{filters.status === 'open' ? null : (
				<FilterChip
					label={`Status: ${filters.status === 'all' ? 'All' : 'Resolved'}`}
					onRemove={() => setFilters({ status: 'open' })}
				/>
			)}
			{[...filters.types].map((id) => (
				<FilterChip
					key={`type-${id}`}
					label={controlTypeLabel(id)}
					onRemove={() => setFilters({ types: without(filters.types, id) })}
				/>
			))}
			{[...filters.people].map((id) => (
				<FilterChip
					key={`person-${id}`}
					label={nameById.get(id) ?? 'Unknown profile'}
					onRemove={() => setFilters({ people: without(filters.people, id) })}
				/>
			))}
		</ActiveFilterBar>
	);
}

/** The same set without one id. */
function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
	const next = new Set(set);
	next.delete(id);
	return next;
}

/**
 * Status, control type, and requester are matched here rather than in the query:
 * status derives from a nullable timestamp rather than a column, and narrowing
 * the shape per filter change would re-stream the whole window each time. An
 * empty set means the filter is off.
 */
function matchesFilters(request: RequestListing, filters: RequestFilters): boolean {
	if (filters.status !== 'all' && requestStatus(request) !== filters.status) {
		return false;
	}
	if (filters.types.size > 0 && !filters.types.has(request.controlType)) {
		return false;
	}
	if (filters.people.size > 0) {
		const requester = request.requestedByProfileId;
		if (requester === null || !filters.people.has(requester)) {
			return false;
		}
	}
	return true;
}

function RequestRow({
	request,
	methodNameById,
	personNameById,
	selectedId,
	onSelect,
}: {
	readonly request: RequestListing;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly selectedId: string | null;
	readonly onSelect: (id: string) => void;
}) {
	const isSelected = request.id === selectedId;
	const methodName = lookup(methodNameById, request.recommendedMethodId);
	const requesterName = lookup(personNameById, request.requestedByProfileId);
	const subject = requestDisplayName(request);
	const timeZone = useOrganizationTimeZone();
	const detail = [
		controlTypeLabel(request.controlType),
		methodName,
		formatRequestedAt(request.requestedAt, timeZone),
	]
		.filter((part): part is string => part !== null)
		.join(' · ');

	return (
		<ExplorerRow
			badges={<RequestStatusBadge status={requestStatus(request)} />}
			detailLabel="Open request"
			detailLink={{ to: '/operations/requests-for-control/$id', params: { id: request.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(request.id)}
			personnel={requesterName ?? 'No requester recorded'}
			selectLabel={`Show ${subject} on the map`}
			subtitle={detail}
			title={subject}
			titleLink={{ to: '/operations/requests-for-control/$id', params: { id: request.id } }}
		/>
	);
}
