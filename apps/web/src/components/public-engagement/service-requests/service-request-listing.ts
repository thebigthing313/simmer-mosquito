/**
 * One service request as `/map/service-requests` lists it, and the request
 * that lists it.
 *
 * The Map's rail and the Table both page through that endpoint, so the row,
 * the filter params and the order param are written once here.
 */

import { whenAny, whenText } from '../../explorer';
import type { ServiceRequestTileFilters } from '../../map';
import type { ServiceRequestFilters, ServiceRequestRailOrder } from './service-requests-search';

/**
 * What a row shows, where on the map it sits, and the ids a surface resolves
 * for the page it draws. `closedAt` arrives as the JSON string the server
 * wrote, and only its presence is read.
 */
export interface ServiceRequestListing {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: number | null;
	readonly intakeType: string;
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly receivedByProfileId: string | null;
	readonly closedAt: string | null;
}

export const SERVICE_REQUESTS_PATH = '/map/service-requests';

/**
 * What the reader has narrowed by, as the tile layer wants it. The Table has no
 * search, Tags or Regions control, so it passes only the four it has.
 *
 * `overdueCutoff` is the Organization's, from `useServiceRequestFilterDefaults`,
 * and `null` while its threshold is off: Overdue then narrows nothing, whatever
 * the address says.
 */
export function serviceRequestTileFilters(
	query: Pick<ServiceRequestFilters, 'status' | 'from' | 'to' | 'overdue'> &
		Partial<Pick<ServiceRequestFilters, 'search' | 'tags' | 'regions'>>,
	overdueCutoff: string | null,
): ServiceRequestTileFilters {
	return {
		...(query.status === 'all' ? {} : { isOpen: query.status === 'open' }),
		...whenText('search', query.search?.trim() ?? ''),
		...whenAny('tagIds', query.tags ?? new Set<string>()),
		...whenAny('regionIds', query.regions ?? new Set<string>()),
		...whenText('dateFrom', query.from),
		...whenText('dateTo', query.to),
		...whenText('overdueBefore', query.overdue ? (overdueCutoff ?? '') : ''),
	};
}

/** The same filters as the query params `/map/service-requests` takes. */
function serviceRequestQueryParams(filters: ServiceRequestTileFilters): {
	readonly status: 'open' | 'closed' | undefined;
	readonly search: string | undefined;
	readonly tagId: readonly string[] | undefined;
	readonly regionId: readonly string[] | undefined;
	readonly dateFrom: string | undefined;
	readonly dateTo: string | undefined;
	readonly overdueBefore: string | undefined;
} {
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
 * The page request's params: the filters, plus the order, which only the page
 * reads. Newest first is the default and goes unsent.
 */
export function serviceRequestPageParams(
	filters: ServiceRequestTileFilters,
	order: ServiceRequestRailOrder,
): Readonly<Record<string, string | boolean | readonly string[] | undefined>> {
	return { ...serviceRequestQueryParams(filters), oldest: order === 'oldest' ? true : undefined };
}
