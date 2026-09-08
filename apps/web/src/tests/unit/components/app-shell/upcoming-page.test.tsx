/** @vitest-environment jsdom */
import { ShellProvider } from '@simmer-mosquito/ui-web/components/app-shell';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthMe } from '../../../../auth';
import { shellDomainsForRole } from '../../../../components/app-shell/navigation';
import { UpcomingPage } from '../../../../components/app-shell/upcoming-page';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ to, children, ...rest }: { readonly to: string; readonly children?: ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

/** The opening words of the copy shown when a path has no entry of its own. */
const FALLBACK = 'The shell, navigation, and routing are wired.';

afterEach(cleanup);

/**
 * The page a wired-but-unbuilt section renders.
 *
 * Its copy is keyed by route path, and a key that does not match its route is
 * not an error: the page falls back to a generic line under whatever the
 * sidebar calls the item, and looks finished. So both tests here are about the
 * key matching, one for the Data Map and one for every stub at once.
 */
describe('UpcomingPage', () => {
	it('names what the Data Map will do and where to work meanwhile', () => {
		renderAt('/gis/data-explorer');

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Data Map');
		expect(screen.getByText(/choose which records draw/i)).toBeTruthy();
		expect(hrefs()).toEqual([
			'/gis/regions',
			'/larval-surveillance/habitats',
			'/adult-surveillance/traps',
		]);
	});

	it('gives every sidebar stub copy of its own', () => {
		// The failure this catches is silent: a key that does not match the route's
		// path still renders, as the generic "will land here" line under whatever
		// the sidebar calls the item. The page looks finished and says nothing.
		const paths = stubPaths();
		expect(paths.length).toBeGreaterThan(0);

		for (const path of paths) {
			const { container } = renderAt(path);
			expect(container.textContent).not.toContain(FALLBACK);
			expect(screen.getByText('What will land here')).toBeTruthy();
			cleanup();
		}
	});
});

function renderAt(activePath: string) {
	return render(
		<ShellProvider
			activePath={activePath}
			currentOrganization={{ id: 'org_1', name: 'Test Organization' }}
			domains={domains()}
			onNavigate={() => undefined}
			onSelectOrganization={() => undefined}
			organizations={[{ id: 'org_1', name: 'Test Organization' }]}
			user={{ name: 'Crew', email: 'crew@example.test' }}
		>
			<UpcomingPage />
		</ShellProvider>,
	);
}

function hrefs(): readonly string[] {
	return screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
}

function stubPaths(): readonly string[] {
	return domains()
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.filter((item) => item.stub === true)
		.map((item) => String(item.to));
}

function domains() {
	return shellDomainsForRole(OWNER);
}

const OWNER: AuthMe = {
	authenticated: true,
	user: {
		workosUserId: 'user_1',
		email: 'crew@example.test',
		firstName: null,
		lastName: null,
		displayName: 'Crew',
		emailVerified: true,
		profilePictureUrl: null,
	},
	workosOrganizationId: 'org_1',
	localIdentity: {
		userId: 'user_1',
		organizationId: 'org_1',
		profileId: 'profile_1',
		membershipId: 'membership_1',
		role: 'owner',
	},
};
