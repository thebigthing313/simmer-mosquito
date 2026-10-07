import { toDbEntityType } from '@simmer-mosquito/domain';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	ExplorerMapPage,
	ExplorerRow,
	SegmentedFilter,
	whenAny,
	whenText,
} from '../../../components/explorer';
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
	requestAgeOrDate,
	serviceRequestTitle,
} from '../../../components/public-engagement/public-engagement-display';
import { ServiceRequestMapCard } from '../../../components/public-engagement/service-request-map-card';
import type { StatusFilter } from '../../../components/public-engagement/service-requests/legend';
import { serviceRequestLegend } from '../../../components/public-engagement/service-requests/legend';
import {
	type ServiceRequestFilterChipProps,
	ServiceRequestFilterFields,
} from '../../../components/public-engagement/service-requests/service-request-filters';
import { ServiceRequestSummaryPanel } from '../../../components/public-engagement/service-requests/service-request-summary-panel';
import { ServiceRequestSurfaceSwitch } from '../../../components/public-engagement/service-requests/service-request-surface-switch';
import {
	type ServiceRequestFilters,
	type ServiceRequestRailOrder,
	type ServiceRequestRailSearch,
	serviceRequestFilterCodecs,
	serviceRequestRailOrderCodecs,
	sharedServiceRequestSearch,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { useTagOptions } from '../../../hooks/explorer/use-tag-options';
import { useServiceRequestFilterDefaults } from '../../../hooks/public-engagement/use-service-request-filter-defaults';
import type { Address } from '../../../hooks/queries/address-view';
import type { ContactSummary } from '../../../hooks/queries/contact-view';
import type { Tag } from '../../../hooks/queries/tag-view';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { useDebouncedTextFilter } from '../../../hooks/use-debounced-text-filter';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { type RecordType, recordNoun } from '../../../lib/record-nouns';
import { DATE_RANGE_COUNTING, searchValidator } from '../../../lib/search-filters';

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
const ORDER_OPTIONS: readonly {
	readonly value: ServiceRequestRailOrder;
	readonly label: string;
}[] = [
	{ value: 'newest', label: 'Newest' },
	{ value: 'oldest', label: 'Oldest' },
];
const ORDER_DEFAULTS: ServiceRequestRailSearch = { order: 'newest' };
const EMPTY_TAGS: readonly Tag[] = [];

export const Route = createFileRoute('/public-engagement/service-requests/')({
	component: ServiceRequestsExplorerRoute,
	validateSearch: searchValidator({
		...serviceRequestFilterCodecs,
		...serviceRequestRailOrderCodecs,
	}),
});

function ServiceRequestsExplorerRoute() {
	// The catalog drives both the filter options and the per-card chip labels.
	const { byId: tagById } = useTagOptions();
	const availableTags = [...tagById.values()];
	const tagNameById = new Map(availableTags.map((tag) => [tag.id, tag.name]));

	// The filter state lives in the URL, so a shared link and Back out of a
	// request both land on the list the operator had narrowed to. An address with
	// no params opens on every request received this year, open or closed.
	const { defaults, today } = useServiceRequestFilterDefaults();
	const { filters: railOrder, setFilters: setRailOrder } = useSearchFilters(
		ORDER_DEFAULTS,
		serviceRequestRailOrderCodecs,
	);
	const {
		filters: query,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(defaults, serviceRequestFilterCodecs, DATE_RANGE_COUNTING);
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
	// Both halves: the field the operator is looking at, and the params on the
	// URL that are actually cutting the list. `reset` drops every filter param in
	// one navigation, which lands on the defaults rather than writing them out.
	const clearAll = () => {
		clearSearchInput();
		reset();
	};
	// What a move to the Table takes with it: status and the date window.
	const carried = sharedServiceRequestSearch(Route.useSearch());
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
	const { rows, total, isLoading, isError, retry, selected, empty, summary, layers } =
		useExplorerResource<RequestListing>({
			path: PATH,
			rowsKey: 'serviceRequests',
			rowKey: 'serviceRequest',
			recordType: RECORD_TYPE,
			params: requestPageParams(filters, railOrder.order),
			layer,
			map,
			selectedId,
			// A pick moves the map to the record and leaves the list as it was, so
			// the reader working down the queue does not lose their place.
			holdRailOnSelect: true,
			summarize: true,
		});

	// Resolve the related on-demand rows for the page alone, a subset of at most
	// a hundred ids that loads reliably, instead of one join over the whole request set.
	const parties = useRequestParties(rows);
	const tagsByRequestId = useEntityTags(
		toDbEntityType('serviceRequest'),
		rows.map((request) => request.id),
	);
	const detailsLoading = !parties.isReady || !tagsByRequestId.isReady;

	// What the filter card's chips read and write, which the summary draws too.
	const chips: ServiceRequestFilterChipProps = {
		activeFilterCount,
		availableTags,
		onClearAll: clearAll,
		regions,
		search,
		selectedRegionIds,
		selectedTagIds,
		setSearch,
		setSelectedRegionIds,
		setSelectedTagIds,
		setStatus,
		status,
	};

	return (
		<ExplorerMapPage
			actions={<ServiceRequestSurfaceSwitch compact current="map" search={carried} />}
			activeFilterCount={activeFilterCount}
			filters={
				<ServiceRequestFilterFields {...chips} dateRange={dateRange} onClearSearch={clearSearch} />
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
						rememberCamera
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
			toolbar={
				<SegmentedFilter
					label="Order"
					onChange={(order: ServiceRequestRailOrder) => setRailOrder({ order })}
					options={ORDER_OPTIONS}
					value={railOrder.order}
				/>
			}
			results={{
				rows,
				revealIndex: rowIndexOf(rows, selectedId),
				isError,
				onRetry: retry,
				empty,
				skeletonClassName: 'h-16',
				// Over 100 in view the rows would not fit on one page, so the panel
				// says what is in view instead (#1371).
				summary: summarySlot({
					chips,
					filters: query,
					setFilters,
					state: summary,
					tagNameById,
				}),
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
						today={today}
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
function requestTileFilters(query: ServiceRequestFilters): ServiceRequestTileFilters {
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

/**
 * The page request's params: the filters, plus the rail's order, which only
 * the page reads. Newest first is the reader's default and goes unsent.
 */
function requestPageParams(
	filters: ServiceRequestTileFilters,
	order: ServiceRequestRailOrder,
): Readonly<Record<string, string | boolean | readonly string[] | undefined>> {
	return { ...requestQueryParams(filters), oldest: order === 'oldest' ? true : undefined };
}

/**
 * What the rail draws in place of its rows: the summary over 100 in view, and
 * nothing at 100 or fewer, so the rows draw (#1371).
 */
function summarySlot(
	props: ComponentProps<typeof ServiceRequestSummaryPanel>,
): ReactNode | undefined {
	return props.state.isShown ? <ServiceRequestSummaryPanel {...props} /> : undefined;
}

/** Where the selected request sits on the page, or `-1` when it is not on it. */
function rowIndexOf(rows: readonly RequestListing[], selectedId: string | null): number {
	return selectedId === null ? -1 : rows.findIndex((request) => request.id === selectedId);
}

function RequestRowItem({
	request,
	tags,
	contact,
	address,
	detailsLoading,
	isFocused,
	onFocus,
	today,
}: {
	readonly request: RequestListing;
	readonly tags: readonly Tag[];
	readonly contact: ContactSummary | null;
	readonly address: Address | null;
	readonly detailsLoading: boolean;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
	/** The Organization's today, which an open request's age is counted to. */
	readonly today: string;
}) {
	const title = serviceRequestTitle(request);
	const subtitle = rowSubtitle({ address, contact, detailsLoading });

	return (
		<ExplorerRow
			// How long an open request has waited, or the day a closed one came in.
			date={requestAgeOrDate(request, today)}
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
