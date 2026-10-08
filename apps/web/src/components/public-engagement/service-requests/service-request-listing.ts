/**
 * One service request as `/map/service-requests` lists it, and the request
 * that lists it.
 *
 * The Map's rail and the Table both page through that endpoint, so the row,
 * the filter params and the order param are written once here.
 */

import type { ServiceRequestTileFilters } from '../../map';
import type { ServiceRequestRailOrder } from './service-requests-search';

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
 * The page request's params: the filters, plus the order, which only the page
 * reads. Newest first is the default and goes unsent.
 */
export function requestPageParams(
	filters: ServiceRequestTileFilters,
	order: ServiceRequestRailOrder,
): Readonly<Record<string, string | boolean | readonly string[] | undefined>> {
	return { ...requestQueryParams(filters), oldest: order === 'oldest' ? true : undefined };
}
