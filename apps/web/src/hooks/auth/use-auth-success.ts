import type { AuthenticatedOutcome } from '@simmer-mosquito/auth/browser';
import { useNavigate } from '@tanstack/react-router';
import { appAuthController } from '../../app-auth';

/**
 * The handoff after a successful authentication: refreshes the cached auth
 * snapshot and navigates to `redirectTo`, or to the organization-required
 * landing when the WorkOS session has no SIMMER organization yet.
 */
export function useAuthSuccess() {
	const navigate = useNavigate();

	return async (outcome: AuthenticatedOutcome, redirectTo: string) => {
		if (outcome.organizationRequired) {
			await navigate({
				to: '/landing',
				search: { auth: 'organization_required', redirect: '/' },
			});
			return;
		}

		await appAuthController.refresh();
		await navigate({ to: redirectTo });
	};
}
