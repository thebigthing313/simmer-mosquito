import { serviceRequestOverdueCutoff } from '@simmer-mosquito/domain';
import {
	type ServiceRequestFilters,
	serviceRequestFilterDefaults,
} from '../../components/public-engagement/service-requests/service-requests-search';
import { todayInTimeZone } from '../../lib/local-date';
import { useOrganizationSettings } from '../queries/use-organization-settings';

/**
 * What a service requests surface's address with no filter params means, the
 * Organization's today, and the overdue cut-off: the first request date that
 * is not overdue under the Organization's threshold, or `null` while the
 * threshold is off. The window opens on this year, so the year turns over on
 * the Organization's calendar rather than the browser's, and so does overdue.
 */
export function useServiceRequestFilterDefaults(): {
	readonly defaults: ServiceRequestFilters;
	readonly today: string;
	readonly overdueCutoff: string | null;
} {
	const settings = useOrganizationSettings();
	const today = todayInTimeZone(settings.timezone);
	return {
		defaults: serviceRequestFilterDefaults(today),
		today,
		overdueCutoff: serviceRequestOverdueCutoff(
			settings.publicEngagement.serviceRequestOverdueDays,
			today,
		),
	};
}
