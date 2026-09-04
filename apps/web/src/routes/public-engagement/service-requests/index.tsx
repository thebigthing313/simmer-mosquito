import { toDbEntityType } from '@simmer-mosquito/domain';
import { boundsFromCoordinates } from '@simmer-mosquito/mapping';
import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import {
	CheckIcon,
	ChevronDownIcon,
	iconRegistry,
	TagIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { inArray, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	toggle,
	useEntityTags,
	useExplorerPanel,
	useRegionMembership,
	useRegionOptions,
	useTagOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	MAP_CREATE_TARGETS,
	MapCanvas,
	SERVICE_REQUEST_STATUS_COLORS,
} from '../../../components/map';
import { TagBadge } from '../../../components/tag-badge';
import type { Address } from '../../../hooks/queries/address-view';
import type { ContactSummary } from '../../../hooks/queries/contact-view';
import type { Tag } from '../../../hooks/queries/tag-view';
import {
	type RequestListing,
	useOrganizationServiceRequests,
} from '../../../hooks/queries/use-organization-service-requests';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { tag_items } from '../../../lib/collections/tag_items';
import {
	choiceParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import {
	contactDisplayName,
	formatAddressLine,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../-public-engagement-display';
import { ServiceRequestMapCard } from '../-service-request-map-card';
import type { StatusFilter } from './-legend';
import { serviceRequestLegend } from './-legend';

const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const RESULT_NOUN = { one: 'request', many: 'requests' };
const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'open', label: 'Open' },
	{ value: 'closed', label: 'Closed' },
	{ value: 'all', label: 'All' },
];
const requestsGcTimeMs = 30_000;
const PAGE_SIZE = 25;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const EMPTY_TAGS: readonly Tag[] = [];

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'open', 'closed'];

interface RequestFilterSet {
	readonly status: StatusFilter;
	readonly search: string;
	readonly tags: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const REQUEST_FILTER_DEFAULTS: RequestFilterSet = {
	status: 'open',
	search: '',
	tags: new Set(),
	regions: new Set(),
};

const REQUEST_FILTER_CODECS: FilterCodecs<RequestFilterSet> = {
	status: choiceParam(STATUS_VALUES, REQUEST_FILTER_DEFAULTS.status),
	search: textParam,
	tags: idSetParam,
	regions: idSetParam,
};

export const Route = createFileRoute('/public-engagement/service-requests/')({
	component: ServiceRequestsExplorerRoute,
	validateSearch: searchValidator(REQUEST_FILTER_CODECS),
});

function ServiceRequestsExplorerRoute() {
	const { requests, isReady } = useOrganizationServiceRequests();

	// The catalog drives both the filter options and the per-card chip labels.
	const { byId: tagById } = useTagOptions();
	const availableTags = useMemo(() => [...tagById.values()], [tagById]);

	// The filter state lives in the URL, so a shared link and Back out of a
	// request both land on the list the operator had narrowed to.
	const {
		filters: query,
		setFilters,
		activeCount: activeFilterCount,
	} = useSearchFilters(REQUEST_FILTER_DEFAULTS, REQUEST_FILTER_CODECS);
	const status = query.status;
	const selectedTagIds = query.tags;
	const selectedRegionIds = query.regions;
	const setStatus = useCallback((next: StatusFilter) => setFilters({ status: next }), [setFilters]);
	const setSelectedTagIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ tags: next }),
		[setFilters],
	);
	const setSelectedRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const { input: search, setInput: setSearch } = useDebouncedTextFilter(query.search, commitSearch);
	// Both halves: the field the operator is looking at, and the committed set on
	// the URL that is actually cutting the list. One patch, one navigation, since
	// two calls would each read the same prior search and the second would undo
	// the first.
	const clearAll = useCallback(() => {
		setSearch('');
		setFilters({ search: '', tags: new Set(), regions: new Set(), status: 'open' });
	}, [setSearch, setFilters]);
	const regions = useRegionOptions();
	// Requests are filtered from rows already synced here, so region membership is
	// answered against the boundaries directly rather than by the server.
	const regionMembership = useRegionMembership(selectedRegionIds);
	const [page, setPage] = useState(0);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const panel = useExplorerPanel();

	// Tag filter is applied through a targeted query keyed on the (few) selected
	// tag ids — it resolves the set of request ids carrying any selected tag,
	// rather than loading tag rows for every request up front.
	const selectedTagKey = [...selectedTagIds].sort().join(',');
	const selectedRegionKey = [...selectedRegionIds].sort().join(',');
	const taggedRequestIds = useRequestIdsForTags(selectedTagIds);

	const filtered = useMemo(
		() =>
			requests.filter((request) =>
				matchesRequest(request, {
					containsPoint: regionMembership.contains,
					search: search.trim().toLowerCase(),
					status,
					taggedRequestIds: selectedTagIds.size === 0 ? null : taggedRequestIds,
				}),
			),
		[requests, status, search, selectedTagIds, taggedRequestIds, regionMembership],
	);

	const legend = useMemo(() => serviceRequestLegend(status), [status]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when the filter set changes.
	useEffect(() => {
		setPage(0);
	}, [search, status, selectedTagKey, selectedRegionKey]);
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	// Resolve the related on-demand rows for the *visible page only* — a ≤25-id
	// subset that loads reliably, instead of one join over the whole request set.
	const visibleRequestIds = useStableIds(visible.map((request) => request.id));
	const parties = useRequestParties(visible);
	const tagsByRequestId = useEntityTags(toDbEntityType('serviceRequest'), visibleRequestIds);
	const detailsLoading = !parties.isReady || !tagsByRequestId.isReady;

	const geoJson = useMemo(() => requestFeatures(filtered), [filtered]);
	// These points come from local rows, so the camera frames the filtered set
	// straight from the list rather than asking the server for an extent.
	const mappedBounds = useMemo(
		() =>
			boundsFromCoordinates(mappable(filtered).map((r) => ({ lng: r.longitude, lat: r.latitude }))),
		[filtered],
	);

	// Fly to a request when it becomes focused (list click or map click).
	const focused = focusedId === null ? null : (requests.find((r) => r.id === focusedId) ?? null);
	useEffect(() => {
		if (map === null || focused === null) {
			return;
		}
		map.flyTo({
			center: [focused.longitude, focused.latitude],
			zoom: Math.max(map.getZoom(), 14),
			duration: 600,
		});
	}, [map, focused]);

	const hasFilter =
		search.trim().length > 0 ||
		status !== 'all' ||
		selectedTagIds.size > 0 ||
		selectedRegionIds.size > 0;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<RequestFilters
					activeFilterCount={activeFilterCount}
					availableTags={availableTags}
					onClearAll={clearAll}
					regions={regions}
					search={search}
					selectedRegionIds={selectedRegionIds}
					selectedTagIds={selectedTagIds}
					setSearch={setSearch}
					setSelectedRegionIds={setSelectedRegionIds}
					setSelectedTagIds={setSelectedTagIds}
					setStatus={setStatus}
					status={status}
				/>
			}
			footer={
				pageCount > 1 ? (
					<ExplorerPagination
						noun={{ one: 'request', many: 'requests' }}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={filtered.length}
					/>
				) : undefined
			}
			heading={{
				title: 'Service Requests',
				icon: RequestIcon,
				total: filtered.length,
				isLoading: !isReady || !regionMembership.isReady,
				noun: RESULT_NOUN,
				create: {
					to: '/public-engagement/service-requests/create',
					label: 'New Request',
					minimum: 'manager',
				},
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						contextMenu={{
							create: [MAP_CREATE_TARGETS.serviceRequest, MAP_CREATE_TARGETS.outreach],
						}}
						controls={{ measure: true, readout: true }}
						fitToData={mappedBounds}
						geoJson={geoJson}
						geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: setFocusedId }}
						inset={panel.inset}
						legend={legend}
						onMapReady={setMap}
						searchWidth={panel.width}
					/>
					{focused === null ? null : (
						<ServiceRequestMapCard
							id={focused.id}
							inset={panel.inset}
							onClose={() => setFocusedId(null)}
						/>
					)}
				</>
			}
			panel={panel}
			results={{
				rows: visible,
				emptyTitle: hasFilter ? 'No requests match' : 'No service requests yet',
				emptyDescription: hasFilter
					? 'Try a different filter or search term.'
					: 'Log a service request to start tracking public reports.',
				skeletonClassName: 'h-16',
				renderRow: (request) => (
					<RequestRowItem
						address={parties.addressById.get(request.addressId) ?? null}
						contact={parties.contactById.get(request.contactId) ?? null}
						detailsLoading={detailsLoading}
						isFocused={request.id === focusedId}
						key={request.id}
						onFocus={() => setFocusedId(request.id)}
						request={request}
						tags={tagsByRequestId.byId.get(request.id) ?? EMPTY_TAGS}
					/>
				),
			}}
		/>
	);
}

/** The filter card's contents: the four controls and the chips that undo them. */
function RequestFilters({
	activeFilterCount,
	availableTags,
	onClearAll,
	regions,
	search,
	selectedRegionIds,
	selectedTagIds,
	setSearch,
	setSelectedRegionIds,
	setSelectedTagIds,
	setStatus,
	status,
}: {
	readonly activeFilterCount: number;
	readonly availableTags: readonly Tag[];
	readonly onClearAll: () => void;
	readonly regions: ReturnType<typeof useRegionOptions>;
	readonly search: string;
	readonly selectedRegionIds: ReadonlySet<string>;
	readonly selectedTagIds: ReadonlySet<string>;
	readonly setSearch: (next: string) => void;
	readonly setSelectedRegionIds: (next: ReadonlySet<string>) => void;
	readonly setSelectedTagIds: (next: ReadonlySet<string>) => void;
	readonly setStatus: (next: StatusFilter) => void;
	readonly status: StatusFilter;
}) {
	const hasTagFilter = availableTags.length > 0 || selectedTagIds.size > 0;
	return (
		<>
			<SearchField
				label="Search service requests"
				onChange={setSearch}
				placeholder="Search requests…"
				value={search}
			/>

			<SegmentedFilter
				label="Status"
				onChange={setStatus}
				options={STATUS_OPTIONS}
				value={status}
			/>

			<FilterGrid>
				{hasTagFilter ? (
					<TagFilter
						onChange={setSelectedTagIds}
						options={availableTags}
						selected={selectedTagIds}
					/>
				) : null}
				<MultiSelectFilter
					empty="No regions"
					label="Region"
					onChange={setSelectedRegionIds}
					options={regions.options}
					selected={selectedRegionIds}
				/>
			</FilterGrid>

			<RequestFilterChips
				activeFilterCount={activeFilterCount}
				availableTags={availableTags}
				onClearAll={onClearAll}
				regions={regions}
				search={search}
				selectedRegionIds={selectedRegionIds}
				selectedTagIds={selectedTagIds}
				setSearch={setSearch}
				setSelectedRegionIds={setSelectedRegionIds}
				setSelectedTagIds={setSelectedTagIds}
				setStatus={setStatus}
				status={status}
			/>
		</>
	);
}

/** What is currently narrowing the list, each chip removing its own filter. */
function RequestFilterChips({
	activeFilterCount,
	availableTags,
	onClearAll,
	regions,
	search,
	selectedRegionIds,
	selectedTagIds,
	setSearch,
	setSelectedRegionIds,
	setSelectedTagIds,
	setStatus,
	status,
}: {
	readonly activeFilterCount: number;
	readonly availableTags: readonly Tag[];
	readonly onClearAll: () => void;
	readonly regions: ReturnType<typeof useRegionOptions>;
	readonly search: string;
	readonly selectedRegionIds: ReadonlySet<string>;
	readonly selectedTagIds: ReadonlySet<string>;
	readonly setSearch: (next: string) => void;
	readonly setSelectedRegionIds: (next: ReadonlySet<string>) => void;
	readonly setSelectedTagIds: (next: ReadonlySet<string>) => void;
	readonly setStatus: (next: StatusFilter) => void;
	readonly status: StatusFilter;
}) {
	if (activeFilterCount === 0) {
		return null;
	}
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
			<StatusChip onReset={() => setStatus('open')} status={status} />
			<SearchChip onClear={() => setSearch('')} search={search} />
			{availableTags
				.filter((tag) => selectedTagIds.has(tag.id))
				.map((tag) => (
					<RemovableTagChip
						key={tag.id}
						onRemove={() => setSelectedTagIds(toggle(selectedTagIds, tag.id))}
						tag={tag}
					/>
				))}
			{[...selectedRegionIds].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regions.nameById.get(id) ?? 'Unknown region'}
					onRemove={() => setSelectedRegionIds(toggle(selectedRegionIds, id))}
				/>
			))}
		</ActiveFilterBar>
	);
}

/** Open is the default, so only Closed or All is worth a chip. */
function StatusChip({
	onReset,
	status,
}: {
	readonly onReset: () => void;
	readonly status: StatusFilter;
}) {
	if (status === 'open') {
		return null;
	}
	return <FilterChip label={`Status: ${status === 'all' ? 'All' : 'Closed'}`} onRemove={onReset} />;
}

function SearchChip({
	onClear,
	search,
}: {
	readonly onClear: () => void;
	readonly search: string;
}) {
	if (search.trim().length === 0) {
		return null;
	}
	return <FilterChip label={`Search: ${search}`} onRemove={onClear} />;
}

/** Whether one request survives the filter set the operator has on. */
function matchesRequest(
	request: RequestListing,
	criteria: {
		readonly containsPoint: (point: { readonly lng: number; readonly lat: number }) => boolean;
		readonly search: string;
		readonly status: StatusFilter;
		/** The ids carrying a selected tag, or `null` when no tag filter is on. */
		readonly taggedRequestIds: ReadonlySet<string> | null;
	},
): boolean {
	const open = isServiceRequestOpen(request);
	if (criteria.status === 'open' && !open) {
		return false;
	}
	if (criteria.status === 'closed' && open) {
		return false;
	}
	if (criteria.taggedRequestIds !== null && !criteria.taggedRequestIds.has(request.id)) {
		return false;
	}
	if (!criteria.containsPoint({ lng: request.longitude, lat: request.latitude })) {
		return false;
	}
	if (criteria.search.length === 0) {
		return true;
	}
	return (
		serviceRequestTitle(request).toLowerCase().includes(criteria.search) ||
		request.details.toLowerCase().includes(criteria.search)
	);
}

/** The requests that have somewhere to be drawn. */
function mappable(requests: readonly RequestListing[]): readonly RequestListing[] {
	return requests.filter(
		(request) => Number.isFinite(request.latitude) && Number.isFinite(request.longitude),
	);
}

/**
 * The overlay the map draws.
 *
 * These points are a plain GeoJSON overlay rather than vector tiles, so the
 * colour travels on the feature and the layer's paint reads it back.
 */
function requestFeatures(requests: readonly RequestListing[]): GeoJSON.GeoJSON | null {
	const features = mappable(requests).map(
		(request): GeoJSON.Feature => ({
			type: 'Feature',
			id: request.id,
			properties: { id: request.id, color: requestSwatch(request).color },
			geometry: { type: 'Point', coordinates: [request.longitude, request.latitude] },
		}),
	);
	return features.length === 0 ? null : { type: 'FeatureCollection', features };
}

/** Dedupe + sort an id list into a stable array reference for query deps. */
function useStableIds(ids: readonly string[]): readonly string[] {
	const key = ids.join(',');
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures `ids`.
	return useMemo(() => [...new Set(ids)].sort(), [key]);
}

/**
 * The set of request ids carrying any of the selected tags, resolved from the
 * on-demand `tag_items` collection with a query keyed on the (few) selected tag
 * ids. entityId is a globally-unique UUID, so a request id in this set provably
 * carries the tag regardless of the polymorphic entity_type discriminator.
 */
function useRequestIdsForTags(selectedTagIds: ReadonlySet<string>): ReadonlySet<string> {
	const tagIds = [...selectedTagIds].sort();
	const key = tagIds.join(',');
	const queryIds = tagIds.length > 0 ? tagIds : [UNMATCHABLE_ID];
	const result = useLiveQuery(
		{
			gcTime: requestsGcTimeMs,
			query: (query) =>
				query
					.from({ item: tag_items })
					.where(({ item }) => inArray(item.tag_id, queryIds))
					.select(({ item }) => ({ entityId: item.entity_id })),
		},
		[key],
	);

	const assignments = result.data;

	return useMemo(() => new Set(assignments.map((item) => item.entityId)), [assignments]);
}

function TagFilter({
	options,
	selected,
	onChange,
}: {
	readonly options: readonly Tag[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label="Filter by tag"
					className="h-8 justify-between font-normal"
					size="sm"
					variant="outline"
				>
					<TagIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
					<span className="truncate">Tags</span>
					<span className="flex items-center gap-1">
						{count > 0 ? (
							<Badge className="px-1.5" variant="secondary">
								{count}
							</Badge>
						) : null}
						<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command>
					<CommandInput placeholder="Search tags…" />
					<CommandList>
						<CommandEmpty>No tags found.</CommandEmpty>
						<CommandGroup>
							{options.map((tag) => {
								const isSelected = selected.has(tag.id);
								return (
									<CommandItem
										key={tag.id}
										onSelect={() => onChange(toggle(selected, tag.id))}
										value={`${tag.name} ${tag.id}`}
									>
										<span
											className={cn(
												'flex size-4 items-center justify-center rounded-sm border',
												isSelected
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-input',
											)}
										>
											{isSelected ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
										</span>
										<TagBadge tag={tag} />
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function RemovableTagChip({ tag, onRemove }: { readonly tag: Tag; readonly onRemove: () => void }) {
	return (
		<span className="inline-flex items-center gap-1">
			<TagBadge tag={tag} />
			<button
				aria-label={`Remove ${tag.name} filter`}
				className="rounded-full p-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}

function RequestRowItem({
	request,
	tags,
	contact,
	address,
	detailsLoading,
	isFocused,
	onFocus,
}: {
	readonly request: RequestListing;
	readonly tags: readonly Tag[];
	readonly contact: ContactSummary | null;
	readonly address: Address | null;
	readonly detailsLoading: boolean;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
}) {
	const title = serviceRequestTitle(request);
	const subtitle = rowSubtitle({ address, contact, detailsLoading });

	return (
		<ExplorerRow
			detailLabel={`View ${title}`}
			detailLink={{
				to: '/public-engagement/service-requests/$id',
				params: { id: request.id },
			}}
			isSelected={isFocused}
			onSelect={onFocus}
			selectLabel={`Show ${title} on the map`}
			subtitle={subtitle}
			/*
			 * The dot is the status. It was a pill beside it saying the same thing, in
			 * a rail where the request's subject shares its line with a contact and an
			 * address.
			 */
			swatch={requestSwatch(request)}
			tags={tags}
			title={title}
			titleLink={{
				to: '/public-engagement/service-requests/$id',
				params: { id: request.id },
			}}
		/>
	);
}

/**
 * Who reported it and where.
 *
 * The contact and the address arrive together from an on-demand subset keyed on
 * the visible page, so while that is in flight the row says so once rather than
 * printing "Loading…" in both halves of one line.
 */
function rowSubtitle({
	address,
	contact,
	detailsLoading,
}: {
	readonly address: Address | null;
	readonly contact: ContactSummary | null;
	readonly detailsLoading: boolean;
}): string {
	if (detailsLoading) {
		return 'Loading…';
	}
	const parts = [
		contact === null ? 'No contact' : contactDisplayName(contact),
		addressLabel(address),
	];
	return parts.filter((part): part is string => part !== null).join(' · ');
}

/** The address line, falling back to whatever name the record carries. */
function addressLabel(address: Address | null): string | null {
	if (address === null) {
		return null;
	}
	return formatAddressLine(address).trim() || address.displayName?.trim() || null;
}

/** The colour this request draws in, so the row matches the map. */
function requestSwatch(request: RequestListing): {
	readonly color: string;
	readonly label: string;
} {
	return isServiceRequestOpen(request)
		? { color: SERVICE_REQUEST_STATUS_COLORS.open, label: 'Open' }
		: { color: SERVICE_REQUEST_STATUS_COLORS.closed, label: 'Closed' };
}

function _toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
	const next = new Set(set);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	return next;
}
