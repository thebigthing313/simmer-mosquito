import { useOrganizations } from './use-organizations';

/**
 * One organization's name and WorkOS organization, read from the directory's
 * cache rather than fetched.
 */
export function useOrganizationIdentity(organizationId: string): {
	readonly name: string | undefined;
	readonly workosOrganizationId: string | null;
} {
	const { data } = useOrganizations();
	const organization = data?.find((row) => row.id === organizationId);
	return {
		name: organization?.name,
		workosOrganizationId: organization?.workosOrganizationId ?? null,
	};
}
