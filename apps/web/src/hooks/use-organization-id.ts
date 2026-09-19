import { useAuthSnapshot } from './use-auth-snapshot';

/**
 * The signed-in membership's organization id off the auth snapshot, or `null`
 * while signed out or before the local identity has loaded.
 */
export function useOrganizationId(): string | null {
	const auth = useAuthSnapshot();
	return auth?.authenticated === true ? (auth.localIdentity?.organizationId ?? null) : null;
}
