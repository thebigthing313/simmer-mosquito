import { useProfileNames } from '../../../hooks/queries/use-profile-names';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import type { ServiceRequestListing } from './service-request-listing';
import { ServiceRequestsTable } from './service-requests-table';

/**
 * A page of Service Requests as the Table route draws it: `ServiceRequestsTable`
 * with the contacts and addresses resolved for the page alone, at most a
 * hundred ids, the way the Map's rail resolves them. Takes the page's rows,
 * today's date and the overdue cut-off, `null` while the Organization's
 * threshold is off.
 */
export function ServiceRequestsPageTable({
	overdueCutoff,
	rows,
	today,
}: {
	readonly overdueCutoff: string | null;
	readonly rows: readonly ServiceRequestListing[];
	readonly today: string;
}) {
	const parties = useRequestParties(rows);
	const profileNames = useProfileNames();
	return (
		<ServiceRequestsTable
			addressById={parties.addressById}
			contactById={parties.contactById}
			overdueCutoff={overdueCutoff}
			profileNames={profileNames}
			rows={rows}
			today={today}
		/>
	);
}
