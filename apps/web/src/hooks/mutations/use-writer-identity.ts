import { useAuthSnapshot } from '../use-auth-snapshot';

/** The organization and actor a catalog write is made on behalf of, off the auth snapshot. */
export function useWriterIdentity(): {
	readonly organizationId: string | null;
	readonly actorProfileId: string | null;
} {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	return {
		organizationId: identity?.organizationId ?? null,
		actorProfileId: identity?.profileId ?? null,
	};
}
