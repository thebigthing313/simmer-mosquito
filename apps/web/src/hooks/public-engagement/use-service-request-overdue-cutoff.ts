import { serviceRequestOverdueCutoffFor } from '../../components/public-engagement/service-requests/service-requests-search';
import { todayInTimeZone } from '../../lib/local-date';
import { useOrganizationSettings } from '../queries/use-organization-settings';

/**
 * The overdue cut-off: the first request date that is not overdue under the
 * Organization's threshold, or `null` while the threshold is off. The tile and
 * page filters and every row read it.
 */
export function useServiceRequestOverdueCutoff(): string | null {
	const settings = useOrganizationSettings();
	return serviceRequestOverdueCutoffFor({ today: todayInTimeZone(settings.timezone), settings });
}
