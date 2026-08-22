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
import { MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
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
import { RequestStatusBadge } from '../-public-engagement-ui';
import { ServiceRequestMapCard } from '../-service-request-map-card';

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

type StatusFilter = 'all' | 'open' | 'closed';

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'open', 'closed'];

interface RequestFilters {
	readonly status: StatusFilter;
	readonly search: string;
	readonly tags: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const REQUEST_FILTER_DEFAULTS: RequestFilters = {
	status: 'open',
	search: '',
	tags: new Set(),
	regions: new Set(),
};

const REQUEST_FILTER_CODECS: FilterCodecs<RequestFilters> = {
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
	const { filters: query, setFilters } = useSearchFilters(
		REQUEST_FILTER_DEFAULTS,
		REQUEST_FILTER_CODECS,
	);
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

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return requests.filter((request) => {
			const open = isServiceRequestOpen(request);
			if (status === 'open' && !open) {
				return false;
			}
			if (status === 'closed' && open) {
				return false;
			}
			if (selectedTagIds.size > 0 && !taggedRequestIds.has(request.id)) {
				return false;
			}
			if (!regionMembership.contains({ lng: request.longitude, lat: request.latitude })) {
				return false;
			}
			if (query.length === 0) {
				return true;
			}
			return (
				serviceRequestTitle(request).toLowerCase().includes(query) ||
				request.details.toLowerCase().includes(query)
			);
		});
	}, [requests, status, search, selectedTagIds, taggedRequestIds, regionMembership]);

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

	const geoJson = useMemo<GeoJSON.GeoJSON | null>(() => {
		const features = filtered
			.filter((request) => Number.isFinite(request.latitude) && Number.isFinite(request.longitude))
			.map(
				(request): GeoJSON.Feature => ({
					type: 'Feature',
					id: request.id,
					properties: { id: request.id },
					geometry: { type: 'Point', coordinates: [request.longitude, request.latitude] },
				}),
			);
		return features.length === 0 ? null : { type: 'FeatureCollection', features };
	}, [filtered]);

	// These points come from local rows, so the camera frames the filtered set
	// straight from the list rather than asking the server for an extent.
	const mappedBounds = useMemo(
		() =>
			boundsFromCoordinates(
				filtered
					.filter(
						(request) => Number.isFinite(request.latitude) && Number.isFinite(request.longitude),
					)
					.map((request) => ({ lng: request.longitude, lat: request.latitude })),
			),
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

	const hasTagFilter = availableTags.length > 0 || selectedTagIds.size > 0;
	const hasFilter =
		search.trim().length > 0 ||
		status !== 'all' ||
		selectedTagIds.size > 0 ||
		selectedRegionIds.size > 0;

	// Open is the default, so only Closed or All counts as something the operator
	// set. Counting the default would put a "1 filter" badge on an untouched page.
	const activeFilterCount =
		(search.trim().length > 0 ? 1 : 0) +
		(status === 'open' ? 0 : 1) +
		selectedTagIds.size +
		selectedRegionIds.size;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
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

					{activeFilterCount > 0 ? (
						<ActiveFilterBar
							// One patch, one navigation: two calls would each read the same
							// prior search and the second would undo the first.
							onClearAll={() => setFilters({ tags: new Set(), regions: new Set(), status: 'open' })}
						>
							{status === 'open' ? null : (
								<FilterChip
									label={`Status: ${status === 'all' ? 'All' : 'Closed'}`}
									onRemove={() => setStatus('open')}
								/>
							)}
							{search.trim().length > 0 ? (
								<FilterChip label={`Search: ${search}`} onRemove={() => setSearch('')} />
							) : null}
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
					) : null}
				</>
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
			map={
				<>
					<MapCanvas
						contextMenu={{
							create: [MAP_CREATE_TARGETS.serviceRequest, MAP_CREATE_TARGETS.outreach],
						}}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData={mappedBounds}
						geoJson={geoJson}
						geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: setFocusedId }}
						inset={panel.inset}
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
	const contactLabel = contact === null ? null : contactDisplayName(contact);
	const addressLabel =
		address === null
			? null
			: formatAddressLine(address).trim() || address.displayName?.trim() || null;
	const title = serviceRequestTitle(request);
	// The contact and the address arrive together from an on-demand subset keyed on
	// the visible page, so while that is in flight the row says so once rather than
	// printing "Loading…" in both halves of one line.
	const subtitle = detailsLoading
		? 'Loading…'
		: [contactLabel ?? 'No contact', addressLabel]
				.filter((part): part is string => part !== null)
				.join(' · ');

	return (
		<ExplorerRow
			badges={<RequestStatusBadge open={isServiceRequestOpen(request)} />}
			detailLabel={`View ${title}`}
			detailLink={{
				to: '/public-engagement/service-requests/$id',
				params: { id: request.id },
			}}
			isSelected={isFocused}
			onSelect={onFocus}
			selectLabel={`Show ${title} on the map`}
			subtitle={subtitle}
			tags={tags}
			title={title}
			titleLink={{
				to: '/public-engagement/service-requests/$id',
				params: { id: request.id },
			}}
		/>
	);
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
