import { useQuery } from '@tanstack/react-query';
import { getOrganizationFoundations, type OrganizationFoundations } from '../../api';

/** The three lookup families the server accepts; `readLookupKind` rejects anything else. */
export type LookupKind = 'collection_methods' | 'collection_lures' | 'habitat_types';

export const foundationKeys = {
	all: ['admin', 'foundations'] as const,
	organization: (organizationId: string) => [...foundationKeys.all, organizationId] as const,
};

/**
 * The one operator read behind the foundations page: every foundation of one
 * organization, from `GET /admin/organizations/:id/foundations`.
 */
export function useOrganizationFoundations(organizationId: string) {
	return useQuery<OrganizationFoundations>({
		queryKey: foundationKeys.organization(organizationId),
		queryFn: () => getOrganizationFoundations(organizationId),
	});
}
