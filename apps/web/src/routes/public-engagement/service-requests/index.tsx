import { toDbEntityType } from '@simmer-mosquito/domain';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow, SegmentedFilter } from '../../../components/explorer';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { MAP_CREATE_TARGETS, SERVICE_REQUEST_STATUS_COLORS } from '../../../components/map';
import {
	contactDisplayName,
	formatAddressLine,
	isServiceRequestOpen,
	requestAgeOrDate,
	requestAgeTone,
	serviceRequestTitle,
} from '../../../components/public-engagement/public-engagement-display';
import { ServiceRequestMapCard } from '../../../components/public-engagement/service-request-map-card';
import {
	type ServiceRequestStatusFilter,
	serviceRequestLegend,
} from '../../../components/public-engagement/service-requests/legend';
import {
	type ServiceRequestFilterChipProps,
	ServiceRequestFilterFields,
} from '../../../components/public-engagement/service-requests/service-request-filters';
import type { ServiceRequestListing } from '../../../components/public-engagement/service-requests/service-request-listing';
import { ServiceRequestSummaryPanel } from '../../../components/public-engagement/service-requests/service-request-summary-panel';
import {
	SERVICE_REQUEST_ORDER_OPTIONS,
	type ServiceRequestRailOrder,
	type ServiceRequestRailSearch,
	serviceRequestOrderParams,
	serviceRequestOverdueCutoffFor,
	serviceRequestRailOrderCodecs,
	serviceRequestRecordSet,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { useTagOptions } from '../../../hooks/explorer/use-tag-options';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import type { Address } from '../../../hooks/queries/address-view';
import type { ContactSummary } from '../../../hooks/queries/contact-view';
import type { Tag } from '../../../hooks/queries/tag-view';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const ORDER_DEFAULTS: ServiceRequestRailSearch = { order: 'newest' };
const EMPTY_TAGS: readonly Tag[] = [];

export const Route = createFileRoute('/public-engagement/service-requests/')({
	component: ServiceRequestsExplorerRoute,
	validateSearch: searchValidator({
		...surfaceCodecs(serviceRequestRecordSet, 'map'),
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
	const { filters: railOrder, setFilters: setRailOrder } = useSearchFilters(
		ORDER_DEFAULTS,
		serviceRequestRailOrderCodecs,
	);
	const {
		filters: query,
		setFilters,
		activeCount: activeFilterCount,
		defaults,
		today,
		searchInput: search,
		setSearchInput: setSearch,
		clearSearch,
		clearAll,
		context,
	} = useRecordSetFilters(serviceRequestRecordSet, 'map');
	const overdueCutoff = serviceRequestOverdueCutoffFor(context);
	const overdueAvailable = overdueCutoff !== null;
	const dateRange = useDateRangeFilters({ from: query.from, to: query.to, today, setFilters });
	const status = query.status;
	const selectedTagIds = query.tags;
	const selectedRegionIds = query.regions;
	const setStatus = (next: ServiceRequestStatusFilter) => setFilters({ status: next });
	const setSelectedTagIds = (next: ReadonlySet<string>) => setFilters({ tags: next });
	const setSelectedRegionIds = (next: ReadonlySet<string>) => setFilters({ regions: next });
	const routeSearch = Route.useSearch();
	const regions = useRegionOptions();
	const panel = useExplorerPanel();
	const [clustered] = useMapClustering();

	// The tiles and the page read one filter shape off one server predicate, so
	// the map and the rail stay in lockstep. The rail used to filter and page the
	// whole Organization's requests out of the sync collection and draw them as a
	// GeoJSON overlay, 1,180 rows in the prod clone over three years (#963).
	const {
		rows,
		total,
		isLoading,
		isError,
		retry,
		empty,
		summary,
		canvas,
		selectedId,
		setSelectedId,
	}: ExplorerResource<ServiceRequestListing> = useExplorerResource({
		set: serviceRequestRecordSet,
		binding: { filters: query, context },
		tileset: 'service-requests',
		rowKey: 'serviceRequest',
		params: serviceRequestOrderParams(railOrder.order),
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
		dateDefaults: defaults,
		dates: query,
		onClearAll: clearAll,
		regions,
		search,
		selectedRegionIds,
		selectedTagIds,
		setDates: setFilters,
		setSearch,
		setSelectedRegionIds,
		setSelectedTagIds,
		setStatus,
		status,
		overdue: query.overdue,
		overdueAvailable,
		setOverdue: (next: boolean) => setFilters({ overdue: next }),
	};

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={serviceRequestRecordSet} />
			}
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
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <ServiceRequestMapCard {...props} />}
					contextMenu={{
						create: [MAP_CREATE_TARGETS.serviceRequest, MAP_CREATE_TARGETS.outreach],
					}}
					legend={serviceRequestLegend(status, clustered)}
					panel={panel}
				/>
			}
			panel={panel}
			toolbar={
				<SegmentedFilter
					label="Order"
					onChange={(order: ServiceRequestRailOrder) => setRailOrder({ order })}
					options={SERVICE_REQUEST_ORDER_OPTIONS}
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
						overdueCutoff={overdueCutoff}
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
 * What the rail draws in place of its rows: the summary over 100 in view, and
 * nothing at 100 or fewer, so the rows draw (#1371).
 */
function summarySlot(
	props: ComponentProps<typeof ServiceRequestSummaryPanel>,
): ReactNode | undefined {
	return props.state.isShown ? <ServiceRequestSummaryPanel {...props} /> : undefined;
}

/** Where the selected request sits on the page, or `-1` when it is not on it. */
function rowIndexOf(rows: readonly ServiceRequestListing[], selectedId: string | null): number {
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
	overdueCutoff,
	today,
}: {
	readonly request: ServiceRequestListing;
	readonly tags: readonly Tag[];
	readonly contact: ContactSummary | null;
	readonly address: Address | null;
	readonly detailsLoading: boolean;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
	/** The first request date that is not overdue, or `null` with the threshold off. */
	readonly overdueCutoff: string | null;
	/** The Organization's today, which an open request's age is counted to. */
	readonly today: string;
}) {
	const title = serviceRequestTitle(request);
	const subtitle = rowSubtitle({ address, contact, detailsLoading });

	return (
		<ExplorerRow
			// How long an open request has waited, or the day a closed one came in.
			date={requestAgeOrDate(request, today)}
			dateWarning={requestAgeTone(request, overdueCutoff) === 'warning' ? 'Overdue' : undefined}
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
function requestSwatch(request: ServiceRequestListing): {
	readonly color: string;
	readonly label: string;
} {
	return isServiceRequestOpen(request)
		? { color: SERVICE_REQUEST_STATUS_COLORS.open, label: 'Open' }
		: { color: SERVICE_REQUEST_STATUS_COLORS.closed, label: 'Closed' };
}
