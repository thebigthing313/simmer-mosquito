import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { switchOrganization } from '../api';
import { appAuthController } from '../app-auth';

/**
 * Re-seals the operator session against the organization, refreshes who the
 * session now is, and drops everything the query cache read as who it was. A
 * refusal is reported as a toast.
 */
export function useEnterOrganization(
	workosOrganizationId: string | null,
	name: string,
): {
	readonly pending: boolean;
	readonly run: () => Promise<void>;
} {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);

	// The switch itself, so `run` can take the busy flag off in a `.finally()`
	// rather than a `finally` block: the React Compiler cannot lower a try
	// statement with a finalizer, and one bails the whole hook (#856).
	async function enterOrganization(organizationId: string) {
		// Through `exchange`, not straight at the endpoint. Re-sealing the
		// session against another organization spends the same single-use refresh
		// token a renewal spends, and a shape stream that met an expired access
		// token at this moment would be renewing through `/auth/me`. Spending it
		// twice is what WorkOS reads as reuse, and it ends the session (#301), so
		// the two take turns.
		//
		// The switch alone goes inside. Reading who we now are is `refresh`, which
		// takes the same browser-wide lock, and that lock is not reentrant: asking
		// from in here would wait on the exchange that is holding it.
		const outcome = await appAuthController.exchange(() => switchOrganization({ organizationId }));

		if (outcome.status !== 'switched') {
			// A refusal is not a malfunction, and the two want different words. The
			// refusal has a fix — somebody grants the membership — and saying so is
			// the point of the gate; the reason WorkOS returns for it is a code
			// like `invalid_grant`, which is not that.
			toast.error(
				outcome.status === 'refused'
					? `You need an admin membership in ${name} before you can enter it.`
					: outcome.reason,
			);
			return;
		}

		await appAuthController.refresh();
		// Everything already fetched was fetched as somebody else, in another
		// organization. None of it describes where this session now is.
		await queryClient.invalidateQueries();
	}

	async function run() {
		if (workosOrganizationId === null) {
			return;
		}

		setPending(true);
		await enterOrganization(workosOrganizationId).finally(() => setPending(false));
	}

	return { pending, run };
}
