import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	type AdminOrganization,
	listAdminOrganizations,
	listOrganizationMemberships,
	type OrganizationMembershipsResult,
} from '../../api';

/**
 * The organization reads, as react-query.
 *
 * Organizations and memberships come from plain `/admin/*` JSON endpoints
 * rather than an Electric shape — they are operator-scoped, not
 * organization-scoped, so there is no organization to authorize a shape against
 * and nothing to stream. That makes them the same case `apps/web` already uses
 * `useQuery` for (see `routes/gis/addresses/-address-data.ts`): fetch, cache,
 * invalidate on write.
 *
 * The keys are shared from here so a create or an invite invalidates the exact
 * lists that just went stale, rather than each page inventing its own key and
 * quietly showing yesterday's data.
 */
const organizationKeys = {
	all: ['admin', 'organizations'] as const,
	list: () => [...organizationKeys.all, 'list'] as const,
	memberships: (organizationId: string) =>
		[...organizationKeys.all, 'memberships', organizationId] as const,
};

export function useOrganizations() {
	return useQuery<AdminOrganization[]>({
		queryKey: organizationKeys.list(),
		queryFn: () => listAdminOrganizations(),
	});
}

export function useOrganizationMemberships(organizationId: string) {
	return useQuery<OrganizationMembershipsResult>({
		queryKey: organizationKeys.memberships(organizationId),
		queryFn: () => listOrganizationMemberships(organizationId),
	});
}

/** Invalidate everything organization-shaped. Used after a create or an invitation. */
export function useInvalidateOrganizations(): () => Promise<void> {
	const queryClient = useQueryClient();
	return async () => {
		await queryClient.invalidateQueries({ queryKey: organizationKeys.all });
	};
}
