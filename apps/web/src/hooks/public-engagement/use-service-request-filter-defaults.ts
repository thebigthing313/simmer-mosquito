import {
	type ServiceRequestFilters,
	serviceRequestFilterDefaults,
} from '../../components/public-engagement/service-requests/service-requests-search';
import { todayInTimeZone } from '../../lib/local-date';
import { useOrganizationTimeZone } from '../use-organization-time-zone';

/**
 * What a service requests surface's address with no filter params means, and
 * the Organization's today. The window opens on this year, so the year turns
 * over on the Organization's calendar rather than the browser's.
 */
export function useServiceRequestFilterDefaults(): {
	readonly defaults: ServiceRequestFilters;
	readonly today: string;
} {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	return { defaults: serviceRequestFilterDefaults(today), today };
}
