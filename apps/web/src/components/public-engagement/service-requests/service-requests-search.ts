import { serviceRequestOverdueCutoff } from '@simmer-mosquito/domain';
import { startOfYear } from '../../../lib/date-presets';
import type { MapQueryValue } from '../../../lib/map-query-params';
import {
	choiceParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	type FilterCounting,
	flagParam,
	idSetParam,
	textParam,
} from '../../../lib/search-filters';
import { defineRecordSet, type RecordSetContext } from '../../explorer/record-set';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { ServiceRequestTileFilters } from '../../map';
import type { ServiceRequestStatusFilter } from './legend';

// The service requests explorer's URL filter contract, outside the route module
// so the Table can read the same params. Every codec drops what it cannot read,
// so a malformed URL degrades to the explorer's defaults.

const STATUS_VALUES: readonly ServiceRequestStatusFilter[] = ['all', 'open', 'closed'];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface ServiceRequestFilters {
	readonly status: ServiceRequestStatusFilter;
	readonly search: string;
	readonly tags: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
	/** Inclusive start of the `request_date` window (`YYYY-MM-DD`), `''` for none. */
	readonly from: string;
	/** Inclusive end of the `request_date` window (`YYYY-MM-DD`), `''` for none. */
	readonly to: string;
	/**
	 * Overdue requests only. Read only while the Organization's threshold is on;
	 * with it off the flag narrows nothing and no control sets it.
	 */
	readonly overdue: boolean;
}

/**
 * The window opens on this year, so `from` and `to` take `dateParam`: an absent
 * param means this year, and All time has to be spelled `any` or a reload
 * would narrow it back.
 */
export const serviceRequestFilterCodecs: FilterCodecs<ServiceRequestFilters> = {
	status: choiceParam(STATUS_VALUES, 'all'),
	search: textParam,
	tags: idSetParam,
	regions: idSetParam,
	from: dateParam,
	to: dateParam,
	overdue: flagParam,
};

/**
 * What the reader has narrowed by, as the tile layer wants it.
 *
 * `overdueCutoff` is the Organization's, from `serviceRequestOverdueCutoffFor`,
 * and `null` while its threshold is off: Overdue then narrows nothing, whatever
 * the address says.
 */
export function serviceRequestTileFilters(
	query: ServiceRequestFilters,
	overdueCutoff: string | null,
): ServiceRequestTileFilters {
	return {
		...(query.status === 'all' ? {} : { isOpen: query.status === 'open' }),
		...whenText('search', query.search.trim()),
		...whenAny('tagIds', query.tags),
		...whenAny('regionIds', query.regions),
		...whenText('dateFrom', query.from),
		...whenText('dateTo', query.to),
		...whenText('overdueBefore', query.overdue ? (overdueCutoff ?? '') : ''),
	};
}

/** The same filters as the query params `/map/service-requests` takes. */
export function serviceRequestListParams(
	filters: ServiceRequestTileFilters,
): Record<string, MapQueryValue> {
	return {
		status: filters.isOpen === undefined ? undefined : filters.isOpen ? 'open' : 'closed',
		search: filters.search,
		tagId: filters.tagIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
		overdueBefore: filters.overdueBefore,
	};
}

/**
 * The first request date that is not overdue under the Organization's
 * threshold, or `null` while the threshold is off. Overdue turns over on the
 * Organization's calendar rather than the browser's.
 */
export function serviceRequestOverdueCutoffFor({
	today,
	settings,
}: RecordSetContext): string | null {
	return serviceRequestOverdueCutoff(settings.publicEngagement.serviceRequestOverdueDays, today);
}

/**
 * How a service request surface counts what is set. An Overdue left on the
 * address while the Organization's threshold is off narrows nothing, so it is
 * not counted.
 */
function serviceRequestCounting(context: RecordSetContext): FilterCounting<ServiceRequestFilters> {
	return serviceRequestOverdueCutoffFor(context) === null
		? { ...DATE_RANGE_COUNTING, uncounted: ['overdue'] }
		: DATE_RANGE_COUNTING;
}

/** The order the Map's rail and the Table page in. */
export type ServiceRequestRailOrder = 'newest' | 'oldest';

export interface ServiceRequestRailSearch {
	readonly order: ServiceRequestRailOrder;
}

/**
 * The order the Map's rail and the Table page in, apart from the filters because
 * it narrows nothing: it does not count as a filter, a reset leaves it alone, and
 * it does not travel between the two surfaces. Newest first stays out of the URL.
 */
export const serviceRequestRailOrderCodecs: FilterCodecs<ServiceRequestRailSearch> = {
	order: choiceParam(['newest', 'oldest'], 'newest'),
};

/**
 * The order as the page request sends it, which only the page reads. Newest
 * first is the default and goes unsent.
 */
export function serviceRequestOrderParams(
	order: ServiceRequestRailOrder,
): Record<string, MapQueryValue> {
	return { oldest: order === 'oldest' ? true : undefined };
}

/** The order control's two choices, drawn by the Map's rail and the Table alike. */
export const SERVICE_REQUEST_ORDER_OPTIONS: readonly {
	readonly value: ServiceRequestRailOrder;
	readonly label: string;
}[] = [
	{ value: 'newest', label: 'Newest' },
	{ value: 'oldest', label: 'Oldest' },
];

/**
 * What an address with no filter params means: every status, from the first of
 * January through the Organization's today.
 */
export function serviceRequestFilterDefaults(today: string): ServiceRequestFilters {
	return {
		status: 'all',
		search: '',
		tags: new Set<string>(),
		regions: new Set<string>(),
		from: startOfYear(today),
		to: today,
		overdue: false,
	};
}

/**
 * The Service Requests Map and Table. Both read `/map/service-requests`. The
 * Table has controls for status, the date window and Overdue and none for
 * Search, Tags or Region, so those three are the Map's alone and a switch to the Table
 * leaves them behind. The `order` param is not a filter and stays on the
 * surface that set it.
 */
export const serviceRequestRecordSet = defineRecordSet({
	recordType: 'serviceRequest',
	paths: {
		map: '/public-engagement/service-requests',
		table: '/public-engagement/service-requests/table',
	},
	codecs: serviceRequestFilterCodecs,
	endpoint: { path: '/map/service-requests', rowsKey: 'serviceRequests', rowKey: 'serviceRequest' },
	tileset: 'service-requests',
	tileFilters: (filters: ServiceRequestFilters, context: RecordSetContext) =>
		serviceRequestTileFilters(filters, serviceRequestOverdueCutoffFor(context)),
	listParams: serviceRequestListParams,
	defaults: ({ today }) => serviceRequestFilterDefaults(today),
	counting: serviceRequestCounting,
	textSearch: { key: 'search' },
	applies: {
		status: 'both',
		search: 'map',
		tags: 'map',
		regions: 'map',
		from: 'both',
		to: 'both',
		overdue: 'both',
	},
});
