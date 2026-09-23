import { toDbEntityType } from '@simmer-mosquito/domain';
import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
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
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { createLabel } from '../../../components/app-shell/navigation';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	toggle,
	whenAny,
	whenText,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
	SERVICE_REQUEST_STATUS_COLORS,
	type ServiceRequestTileFilters,
} from '../../../components/map';
import {
	contactDisplayName,
	formatAddressLine,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../../../components/public-engagement/public-engagement-display';
import { ServiceRequestMapCard } from '../../../components/public-engagement/service-request-map-card';
import type { StatusFilter } from '../../../components/public-engagement/service-requests/legend';
import { serviceRequestLegend } from '../../../components/public-engagement/service-requests/legend';
import { TagBadge } from '../../../components/tag-badge';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { useTagOptions } from '../../../hooks/explorer/use-tag-options';
import type { Address } from '../../../hooks/queries/address-view';
import type { ContactSummary } from '../../../hooks/queries/contact-view';
import type { Tag } from '../../../hooks/queries/tag-view';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { useDebouncedTextFilter } from '../../../hooks/use-debounced-text-filter';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { todayInTimeZone } from '../../../lib/local-date';
import { type RecordType, recordNoun } from '../../../lib/record-nouns';
import {
	choiceParam,
	DATE_RANGE_COUNTING,
	type FilterCodecs,
	idSetParam,
	openDateParam,
	searchValidator,
	textParam,
} from '../../../lib/search-filters';

/**
 * A service request as `/map/service-requests` lists it: what the row shows,
 * where on the map it sits, and the two ids the rail resolves for the page it
 * draws. `closedAt` arrives as the JSON string the server wrote, and only its
 * presence is read.
 */
interface RequestListing {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: number | null;
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly closedAt: string | null;
}

const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const RECORD_TYPE: RecordType = 'serviceRequest';
const PATH = '/map/service-requests';
const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'open', label: 'Open' },
	{ value: 'closed', label: 'Closed' },
	{ value: 'all', label: 'All' },
];
const EMPTY_TAGS: readonly Tag[] = [];

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'open', 'closed'];

interface RequestFilterSet {
	readonly status: StatusFilter;
	readonly search: string;
	readonly tags: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
	/**
	 * A window over `request_date`, with no default: #920 decided a date
	 * default here is not a substitute for the viewport, and an empty bound is
	 * no bound. The period-in-review count links write both so they land on
	 * the rows they counted.
	 */
	readonly from: string;
	readonly to: string;
}

const REQUEST_FILTER_DEFAULTS: RequestFilterSet = {
	status: 'open',
	search: '',
	tags: new Set(),
	regions: new Set(),
	from: '',
	to: '',
};

const REQUEST_FILTER_CODECS: FilterCodecs<RequestFilterSet> = {
	status: choiceParam(STATUS_VALUES, REQUEST_FILTER_DEFAULTS.status),
	search: textParam,
	tags: idSetParam,
	regions: idSetParam,
	from: openDateParam,
	to: openDateParam,
};

export const Route = createFileRoute('/public-engagement/service-requests/')({
	component: ServiceRequestsExplorerRoute,
	validateSearch: searchValidator(REQUEST_FILTER_CODECS),
});

function ServiceRequestsExplorerRoute() {
	// The catalog drives both the filter options and the per-card chip labels.
	const { byId: tagById } = useTagOptions();
	const availableTags = [...tagById.values()];

	// The filter state lives in the URL, so a shared link and Back out of a
	// request both land on the list the operator had narrowed to.
	const {
		filters: query,
		setFilters,
		activeCount: activeFilterCount,
	} = useSearchFilters(REQUEST_FILTER_DEFAULTS, REQUEST_FILTER_CODECS, DATE_RANGE_COUNTING);
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const dateRange = useDateRangeFilters({ from: query.from, to: query.to, today, setFilters });
	const status = query.status;
	const selectedTagIds = query.tags;
	const selectedRegionIds = query.regions;
	const setStatus = (next: StatusFilter) => setFilters({ status: next });
	const setSelectedTagIds = (next: ReadonlySet<string>) => setFilters({ tags: next });
	const setSelectedRegionIds = (next: ReadonlySet<string>) => setFilters({ regions: next });
	const commitSearch = (next: string) => setFilters({ search: next });
	const {
		input: search,
		setInput: setSearch,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(query.search, commitSearch);
	// Both halves: the field the operator is looking at, and the committed term on
	// the URL that is actually cutting the list.
	const clearSearch = () => {
		clearSearchInput();
		commitSearch('');
	};
	// Both halves: the field the operator is looking at, and the committed set on
	// the URL that is actually cutting the list. One patch, one navigation, since
	// two calls would each read the same prior search and the second would undo
	// the first.
	const clearAll = () => {
		setSearch('');
		setFilters({
			search: '',
			tags: new Set(),
			regions: new Set(),
			status: 'open',
			from: '',
			to: '',
		});
	};
	const regions = useRegionOptions();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const panel = useExplorerPanel();

	// The tiles and the page read one filter shape off one server predicate, so
	// the map and the rail stay in lockstep. The rail used to filter and page the
	// whole Organization's requests out of the sync collection and draw them as a
	// GeoJSON overlay, 1,180 rows in the prod clone over three years (#963).
	const filters = requestTileFilters(query);
	const legend = serviceRequestLegend(status);
	const layer: MapTileLayer = {
		kind: 'service-requests',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const layers: readonly MapTileLayer[] = [layer];
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage, selected, empty } =
		useExplorerResource<RequestListing>({
			path: PATH,
			rowsKey: 'serviceRequests',
			rowKey: 'serviceRequest',
			recordType: RECORD_TYPE,
			params: requestQueryParams(filters),
			layer,
			map,
			selectedId,
		});

	// Resolve the related on-demand rows for the page alone, a subset of at most
	// fifty ids that loads reliably, instead of one join over the whole request set.
	const parties = useRequestParties(rows);
	const tagsByRequestId = useEntityTags(
		toDbEntityType('serviceRequest'),
		rows.map((request) => request.id),
	);
	const detailsLoading = !parties.isReady || !tagsByRequestId.isReady;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<RequestFilters
					activeFilterCount={activeFilterCount}
					availableTags={availableTags}
					dateRange={dateRange}
					onClearAll={clearAll}
					onClearSearch={clearSearch}
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
				<ExplorerPagination
					noun={recordNoun(RECORD_TYPE)}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: recordNoun('serviceRequest').titleMany,
				icon: RequestIcon,
				total,
				isLoading,
				create: {
					to: '/public-engagement/service-requests/create',
					label: createLabel('serviceRequest'),
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
						fitToData
						inset={panel.inset}
						layers={layers}
						legend={legend}
						onMapReady={setMap}
						searchWidth={panel.width}
					/>
					{selected === null ? null : (
						<ServiceRequestMapCard
							id={selected.id}
							inset={panel.inset}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				empty,
				skeletonClassName: 'h-16',
				renderRow: (request) => (
					<RequestRowItem
						address={parties.addressById.get(request.addressId) ?? null}
						contact={parties.contactById.get(request.contactId) ?? null}
						detailsLoading={detailsLoading}
						isFocused={request.id === selectedId}
						key={request.id}
						onFocus={() => setSelectedId(request.id)}
						request={request}
						tags={tagsByRequestId.byId.get(request.id) ?? EMPTY_TAGS}
					/>
				),
			}}
		/>
	);
}

/**
 * The filter shape the tiles and the page both read, off the URL's filter set.
 * `all` is no status filter at all rather than a third value, and an empty
 * search, tag set or region set drops out so the query names only what narrows.
 */
function requestTileFilters(query: RequestFilterSet): ServiceRequestTileFilters {
	return {
		...(query.status === 'all' ? {} : { isOpen: query.status === 'open' }),
		...whenText('search', query.search.trim()),
		...whenAny('tagIds', query.tags),
		...whenAny('regionIds', query.regions),
		...whenText('dateFrom', query.from),
		...whenText('dateTo', query.to),
	};
}

/** The same filters as the query params `/map/service-requests` takes. */
function requestQueryParams(filters: ServiceRequestTileFilters): {
	readonly status: 'open' | 'closed' | undefined;
	readonly search: string | undefined;
	readonly tagId: readonly string[] | undefined;
	readonly regionId: readonly string[] | undefined;
	readonly dateFrom: string | undefined;
	readonly dateTo: string | undefined;
} {
	return {
		status: filters.isOpen === undefined ? undefined : filters.isOpen ? 'open' : 'closed',
		search: filters.search,
		tagId: filters.tagIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
	};
}

/** The filter card's contents: the five controls and the chips that undo them. */
function RequestFilters({
	activeFilterCount,
	availableTags,
	dateRange,
	onClearAll,
	onClearSearch,
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
	readonly dateRange: ReturnType<typeof useDateRangeFilters>;
	readonly onClearAll: () => void;
	readonly onClearSearch: () => void;
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
			<SearchInput
				label="Search service requests"
				onChange={(event) => setSearch(event.target.value)}
				onClear={onClearSearch}
				placeholder="Search requests…"
				value={search}
			/>

			<SegmentedFilter
				label="Status"
				onChange={setStatus}
				options={STATUS_OPTIONS}
				value={status}
			/>

			<DateRangeFilter {...dateRange} />

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
