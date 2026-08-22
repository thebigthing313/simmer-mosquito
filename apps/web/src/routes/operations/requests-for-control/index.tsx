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
	const { filters, setFilters, reset } = useSearchFilters(filterDefaults, FILTER_CODECS);
	const status = filters.status;

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

	const mapped = useMemo(
		() => visible.filter((request) => Number.isFinite(request.lat) && Number.isFinite(request.lng)),
		[visible],
	);

	const geoJson = useMemo<GeoJSON.GeoJSON | null>(() => {
		const features = mapped.map(
			(request): GeoJSON.Feature => ({
				type: 'Feature',
				id: request.id,
				properties: { id: request.id },
				geometry: { type: 'Point', coordinates: [request.lng, request.lat] },
			}),
		);
		return features.length === 0 ? null : { type: 'FeatureCollection', features };
	}, [mapped]);

	// The points come from local rows, so the camera frames the filtered set from
	// the list rather than asking the server for an extent.
	const bounds = useMemo(
		() => boundsFromCoordinates(mapped.map((request) => ({ lng: request.lng, lat: request.lat }))),
		[mapped],
	);

	const selected = selectedId === null ? null : (visible.find((r) => r.id === selectedId) ?? null);

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

	const handleFromChange = useCallback(
		(next: string) => {
			setFilters({
				from: next,
				...(next !== '' && filters.to !== '' && next > filters.to ? { to: next } : {}),
			});
		},
		[setFilters, filters.to],
	);
	const handleToChange = useCallback(
		(next: string) => {
			setFilters({
				to: next,
				...(next !== '' && filters.from !== '' && next < filters.from ? { from: next } : {}),
			});
		},
		[setFilters, filters.from],
	);
	const applyPreset = useCallback(
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

	// Open is the default, so only All or Resolved counts as something the operator
	// set. Counting the default would put a "1 filter" badge on an untouched page.
	const activeFilterCount = (status === 'open' ? 0 : 1) + filters.types.size + filters.people.size;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<DateRangeFilter
						activePresetId={activePresetId}
						from={filters.from}
						onApplyPreset={applyPreset}
						onFromChange={handleFromChange}
						onToChange={handleToChange}
						to={filters.to}
						today={today}
					/>

					<SegmentedFilter
						label="Status"
						onChange={(next: StatusFilter) => setFilters({ status: next })}
						options={STATUS_OPTIONS}
						value={status}
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

					{activeFilterCount > 0 ? (
						<ActiveFilterBar onClearAll={reset}>
							{status === 'open' ? null : (
								<FilterChip
									label={`Status: ${status === 'all' ? 'All' : 'Resolved'}`}
									onRemove={() => setFilters({ status: 'open' })}
								/>
							)}
							{[...filters.types].map((id) => (
								<FilterChip
									key={`type-${id}`}
									label={controlTypeLabel(id)}
									onRemove={() => {
										const next = new Set(filters.types);
										next.delete(id);
										setFilters({ types: next });
									}}
								/>
							))}
							{[...filters.people].map((id) => (
								<FilterChip
									key={`person-${id}`}
									label={nameById.get(id) ?? 'Unknown profile'}
									onRemove={() => {
										const next = new Set(filters.people);
										next.delete(id);
										setFilters({ people: next });
									}}
								/>
							))}
						</ActiveFilterBar>
					) : null}
				</>
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
					controls={{ layers: false, measure: true, readout: true }}
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
						isSelected={request.id === selectedId}
						key={request.id}
						methodName={
							request.recommendedMethodId === null
								? null
								: (methodNameById.get(request.recommendedMethodId) ?? null)
						}
						onSelect={setSelectedId}
						request={request}
						requesterName={
							request.requestedByProfileId === null
								? null
								: (nameById.get(request.requestedByProfileId) ?? null)
						}
					/>
				),
			}}
		/>
	);
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
	methodName,
	requesterName,
	isSelected,
	onSelect,
}: {
	readonly request: RequestListing;
	readonly methodName: string | null;
	readonly requesterName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
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
