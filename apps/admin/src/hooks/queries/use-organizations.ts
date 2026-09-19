import { useQuery } from '@tanstack/react-query';
import { type AdminOrganization, listAdminOrganizations } from '../../api';
import { organizationKeys } from './organization-keys';

/** Every organization the operator console lists, from `GET /admin/organizations`. */
export function useOrganizations() {
	return useQuery<AdminOrganization[]>({
		queryKey: organizationKeys.list(),
		queryFn: () => listAdminOrganizations(),
	});
}
