/**
 * The react-query keys the organization reads share, so a create or an invite
 * invalidates the exact lists that just went stale.
 */
export const organizationKeys = {
	all: ['admin', 'organizations'] as const,
	list: () => [...organizationKeys.all, 'list'] as const,
	memberships: (organizationId: string) =>
		[...organizationKeys.all, 'memberships', organizationId] as const,
};
