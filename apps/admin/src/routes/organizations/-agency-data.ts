import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	type AdminAgency,
	type AgencyMembershipsResult,
	listAdminAgencies,
	listAgencyMemberships,
} from '../../api';

/**
 * The agency reads, as react-query.
 *
 * Agencies and memberships come from plain `/admin/*` JSON endpoints rather than
 * an Electric shape — they are operator-scoped, not agency-scoped, so there is
 * no tenant to authorize a shape against and nothing to stream. That makes them
 * the same case `apps/web` already uses `useQuery` for (see
 * `routes/gis/addresses/-address-data.ts`): fetch, cache, invalidate on write.
 *
 * The keys are shared from here so a create or an invite invalidates the exact
 * lists that just went stale, rather than each page inventing its own key and
 * quietly showing yesterday's data.
 */
const agencyKeys = {
	all: ['admin', 'agencies'] as const,
	list: () => [...agencyKeys.all, 'list'] as const,
	memberships: (organizationId: string) =>
		[...agencyKeys.all, 'memberships', organizationId] as const,
};

export function useAgencies() {
	return useQuery<AdminAgency[]>({
		queryKey: agencyKeys.list(),
		queryFn: () => listAdminAgencies(),
	});
}

export function useAgencyMemberships(organizationId: string) {
	return useQuery<AgencyMembershipsResult>({
		queryKey: agencyKeys.memberships(organizationId),
		queryFn: () => listAgencyMemberships(organizationId),
	});
}

/** Invalidate everything agency-shaped. Used after a create or an invitation. */
export function useInvalidateAgencies(): () => Promise<void> {
	const queryClient = useQueryClient();
	return async () => {
		await queryClient.invalidateQueries({ queryKey: agencyKeys.all });
	};
}
