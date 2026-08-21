import { boundsFromCoordinates } from '@simmer-mosquito/mapping';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ChevronRightIcon, iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	activeDatePresetId,
	type DatePreset,
	DateRangeFilter,
	datePresetRange,
} from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	FilterChip,
	type FilterOption,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	SegmentedFilter,
	useControlMethodNames,
	usePersonnelOptions,
} from '../../../components/explorer';
import { MapCanvas } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
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

	const hasChips = filters.types.size > 0 || filters.people.size > 0;

	return (
		<MapSplitPage
			map={
				<MapCanvas
					contextMenu={{}}
					controls={{ layers: false, measure: true }}
					fitToData={bounds}
					geoJson={geoJson}
					geoJsonInteraction={{ selectedId, onSelectFeature: setSelectedId }}
					onMapReady={setMap}
				/>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2">
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
								Requests for Control
							</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 request' : `${visible.length} requests`}
							</span>
						</div>
						<WriteOnly>
							<Button asChild size="sm">
								<Link to="/operations/requests-for-control/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									New Request
								</Link>
							</Button>
						</WriteOnly>
					</div>

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

					<div className="flex flex-wrap gap-2">
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
					</div>

					{hasChips ? (
						<ActiveFilterBar onClearAll={reset}>
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
				</div>

				<RequestResults
					isLoading={isLoading}
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					personnelNameById={nameById}
					requests={visible}
					selectedId={selectedId}
				/>
			</div>
		</MapSplitPage>
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

function RequestResults({
	requests,
	isLoading,
	selectedId,
	methodNameById,
	personnelNameById,
	onSelect,
}: {
	readonly requests: readonly RequestListing[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	if (isLoading) {
		return (
			<div className="grid gap-2 p-4">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[68px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (requests.length === 0) {
		return (
			<div className="p-4">
				<Empty className="min-h-[240px] border border-border/40 bg-muted/30">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<RequestIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No Requests in Range</EmptyTitle>
						<EmptyDescription>
							Widen the time window or loosen the filters to bring requests into range.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<ul className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-4">
			{requests.map((request) => (
				<RequestRow
					isSelected={request.id === selectedId}
					key={request.id}
					methodName={
						request.recommendedMethodId === null
							? null
							: (methodNameById.get(request.recommendedMethodId) ?? null)
					}
					onSelect={onSelect}
					request={request}
					requesterName={
						request.requestedByProfileId === null
							? null
							: (personnelNameById.get(request.requestedByProfileId) ?? null)
					}
				/>
			))}
		</ul>
	);
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

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected ? 'border-primary/60 bg-primary/5' : 'border-border/60 hover:border-border',
			)}
		>
			{/* Full-card target selects on the map; the chevron opens the record. */}
			<button
				aria-label={`Show ${subject} on the map`}
				className="absolute inset-0 z-0 cursor-pointer rounded-lg"
				onClick={() => onSelect(request.id)}
				type="button"
			/>
			<div className="pointer-events-none relative z-10 flex items-start gap-3 p-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground text-sm">{subject}</span>
						<RequestStatusBadge status={requestStatus(request)} />
					</div>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{controlTypeLabel(request.controlType)}
						{methodName === null ? '' : ` · ${methodName}`}
						{` · ${formatRequestedAt(request.requestedAt, timeZone)}`}
					</p>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{requesterName ?? 'No requester recorded'}
					</p>
				</div>
				<Link
					aria-label="Open request"
					className="pointer-events-auto z-20 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					params={{ id: request.id }}
					to="/operations/requests-for-control/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}
