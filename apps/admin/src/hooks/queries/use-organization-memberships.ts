import { useQuery } from '@tanstack/react-query';
import { listOrganizationMemberships, type OrganizationMembershipsResult } from '../../api';
import { organizationKeys } from './organization-keys';

/** One organization's memberships, from the operator endpoint. */
export function useOrganizationMemberships(organizationId: string) {
	return useQuery<OrganizationMembershipsResult>({
		queryKey: organizationKeys.memberships(organizationId),
		queryFn: () => listOrganizationMemberships(organizationId),
	});
}
