/** @vitest-environment jsdom */
import type { AuthMe } from '@simmer-mosquito/auth/browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The gate is the page (ADR 0011): a console page that writes an agency's
 * records renders nothing until the session is inside that agency, because every
 * write on it would otherwise land in whichever agency the session is actually
 * in.
 *
 * All four collaborators are faked. `switchOrganization` is the network call
 * under test — what it is *handed* is the thing worth pinning — and the auth
 * controller is a module-level singleton whose snapshot has no setter, so the
 * test drives it through a fake rather than through `/auth/me`.
 */

const switchOrganization = vi.fn();
const refresh = vi.fn(async () => authSnapshot as AuthMe);
const toastError = vi.fn();
/**
 * The real one serializes a session change against renewals, so the two cannot
 * spend the same single-use refresh token (#301). Here it only records that the
 * switch went through it and runs the operation; the ordering it enforces is
 * covered where it lives, in `packages/auth`.
 */
const exchange = vi.fn(<T,>(operation: () => Promise<T>) => operation());

let authSnapshot: AuthMe | null = null;

vi.mock('../../../api', () => ({
	switchOrganization: (input: { readonly organizationId: string }) => switchOrganization(input),
}));

vi.mock('../../../app-auth', () => ({
	appAuthController: {
		get snapshot() {
			return authSnapshot;
		},
		refresh: () => refresh(),
		exchange: <T,>(operation: () => Promise<T>) => exchange(operation),
		subscribe: () => () => {},
	},
}));

vi.mock('sonner', () => ({ toast: { error: (message: string) => toastError(message) } }));

const { AgencySessionGate } = await import('../../../components/agency-session');

const SIMMER_ORGANIZATION_ID = '2f4a1f1c-4a3a-4d21-9d1a-0d9d2f5d4b11';
const WORKOS_ORGANIZATION_ID = 'org_01JQZ7Y8ZQ0000000000000000';

describe('AgencySessionGate', () => {
	beforeEach(() => {
		authSnapshot = null;
		switchOrganization.mockReset();
		refresh.mockReset();
		toastError.mockReset();
		// Cleared rather than reset: this one carries an implementation, and a reset
		// would leave it returning `undefined` for every case after the first.
		exchange.mockClear();
	});

	afterEach(cleanup);

	it('renders the page when the session is already inside the agency', () => {
		authSnapshot = signedInTo(SIMMER_ORGANIZATION_ID);

		renderGate();

		expect(screen.getByText('The foundations panel')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Enter/ })).toBeNull();
	});

	it('offers the way in when the session is inside some other agency', () => {
		authSnapshot = signedInTo('c0ffee00-0000-4000-8000-000000000000');

		renderGate();

		expect(screen.queryByText('The foundations panel')).toBeNull();
		expect(screen.getByRole('button', { name: 'Enter Kern County MVCD' })).toBeTruthy();
	});

	// The two ids live on the same agency object one line apart, and swapping
	// them is not a type error: both are strings, and the only symptom is a
	// silent refusal from WorkOS, which knows nothing about SIMMER's own ids.
	it('switches to the WorkOS organization id, not the SIMMER one', async () => {
		authSnapshot = signedInTo(null);
		switchOrganization.mockResolvedValue({ status: 'switched' });

		renderGate();
		screen.getByRole('button', { name: 'Enter Kern County MVCD' }).click();

		await waitFor(() => {
			expect(switchOrganization).toHaveBeenCalledWith({
				organizationId: WORKOS_ORGANIZATION_ID,
			});
		});
		await waitFor(() => {
			expect(refresh).toHaveBeenCalled();
		});
	});

	// Not decoration on the call above. Re-sealing the session and renewing it
	// spend the same single-use refresh token, and going straight at the endpoint
	// is what let the two overlap (#301).
	it('re-seals the session through the gate that renewals take, not around it', async () => {
		authSnapshot = signedInTo(null);
		switchOrganization.mockResolvedValue({ status: 'switched' });

		renderGate();
		screen.getByRole('button', { name: 'Enter Kern County MVCD' }).click();

		await waitFor(() => {
			expect(exchange).toHaveBeenCalledOnce();
		});
		expect(switchOrganization).toHaveBeenCalledOnce();
	});

	// A refusal means the operator holds no membership in the agency, which is
	// somebody's deliberate act to fix. Reloading the session would only confirm
	// it is still the session it was.
	//
	// The words are the fix, not the code WorkOS refused with: `invalid_grant`
	// tells an operator nothing about what to do next.
	it('surfaces a refusal as the membership it needs, and does not reload the session', async () => {
		authSnapshot = signedInTo(null);
		switchOrganization.mockResolvedValue({ status: 'refused', reason: 'invalid_grant' });

		renderGate();
		screen.getByRole('button', { name: 'Enter Kern County MVCD' }).click();

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith(
				'You need an admin membership in Kern County MVCD before you can enter it.',
			);
		});
		expect(refresh).not.toHaveBeenCalled();
	});

	// Anything that is not a refusal still says what went wrong in its own words.
	it('passes a genuine failure through', async () => {
		authSnapshot = signedInTo(null);
		switchOrganization.mockResolvedValue({
			status: 'error',
			reason: 'Unable to switch organization.',
		});

		renderGate();
		screen.getByRole('button', { name: 'Enter Kern County MVCD' }).click();

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith('Unable to switch organization.');
		});
		expect(refresh).not.toHaveBeenCalled();
	});

	it('has nothing to enter, and says so, when the agency has no WorkOS organization', () => {
		authSnapshot = signedInTo(null);

		renderGate(null);

		const button = screen.getByRole('button', { name: 'Enter Kern County MVCD' });
		expect(button.hasAttribute('disabled')).toBe(true);
		expect(screen.getByText(/has no WorkOS organization yet/)).toBeTruthy();
	});

	it('gates a signed-out session rather than rendering the page', () => {
		authSnapshot = { authenticated: false, reason: 'No session.' };

		renderGate();

		expect(screen.queryByText('The foundations panel')).toBeNull();
		expect(screen.getByRole('button', { name: 'Enter Kern County MVCD' })).toBeTruthy();
	});
});

function renderGate(workosOrganizationId: string | null = WORKOS_ORGANIZATION_ID) {
	return render(
		<Providers>
			<AgencySessionGate
				agencyName="Kern County MVCD"
				organizationId={SIMMER_ORGANIZATION_ID}
				workosOrganizationId={workosOrganizationId}
			>
				<p>The foundations panel</p>
			</AgencySessionGate>
		</Providers>,
	);
}

function Providers({ children }: { readonly children: ReactNode }) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function signedInTo(organizationId: string | null): AuthMe {
	return {
		authenticated: true,
		user: {
			workosUserId: 'user_01JQZ7Y8ZQ0000000000000000',
			email: 'operator@simmer-data.com',
			firstName: 'Sam',
			lastName: 'Operator',
			displayName: 'Sam Operator',
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: organizationId === null ? null : WORKOS_ORGANIZATION_ID,
		localIdentity: {
			userId: 'de8f4a2b-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
			organizationId,
			profileId: null,
			membershipId: null,
			role: null,
		},
	};
}
