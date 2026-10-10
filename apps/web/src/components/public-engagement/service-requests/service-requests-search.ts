import { startOfYear } from '../../../lib/date-presets';
import {
	choiceParam,
	dateParam,
	type FilterCodecs,
	idSetParam,
	textParam,
} from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
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
};

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
	};
}

/**
 * The Service Requests Map and Table. Both read `/map/service-requests`. The
 * Table has controls for status and the date window and none for Search, Tags
 * or Region, so those three are the Map's alone and a switch to the Table
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
	applies: { status: 'both', search: 'map', tags: 'map', regions: 'map', from: 'both', to: 'both' },
});
