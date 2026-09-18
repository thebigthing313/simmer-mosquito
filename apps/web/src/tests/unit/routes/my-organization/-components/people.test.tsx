/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PersonListing } from '../../../../../hooks/queries/use-people-directory';
import type { SimmerRole } from '../../../../../routes/my-organization/-components/types';
import { signedInSnapshotWith } from '../../route-mock-stand-ins';

/**
 * The width the People rows draw at.
 *
 * `OrganizationWorkspaceShell` draws every my-organization section at the
 * `record` measure since #1045, and a People row is a grid whose name column
 * grows to fill everything up to the actions, so on a 1920 screen the two ends
 * of one row sat about 1400px apart (#1054). The list carries `46rem` itself,
 * the measure the assignments create form carries: the shell passes nothing
 * down and no shared constant names it, because two call sites do not earn one.
 *
 * jsdom lays nothing out, so this asserts the class and where it sits rather
 * than a pixel width. The invite controls stay in the header above the cap,
 * which is the half a class on the wrong wrapper would get wrong.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ to, children, ...rest }: { readonly to: string; readonly children?: ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock('../../../../../hooks/mutations/use-membership-mutations', () => ({
	useMembershipMutations: () => ({ invite: vi.fn(), changeRole: vi.fn() }),
}));
vi.mock('../../../../../hooks/mutations/use-profile-mutations', () => ({
	useProfileMutations: () => ({ createHistorical: vi.fn(), save: vi.fn() }),
	profileSavePlan: vi.fn(),
}));
vi.mock('../../../../../hooks/queries/use-people-directory', () => ({
	usePeopleDirectory: () => ({
		activeLinked: [ACTIVE_PERSON],
		inactiveLinked: [],
		historical: [HISTORICAL_PERSON],
	}),
}));

const { PeopleSection } = await import('../../../../../routes/my-organization/-components/people');

const ACTIVE_PERSON = {
	profileId: 'profile_2',
	displayName: 'Sam Rivera',
	isActive: true,
	userId: 'user_2',
	email: 'crew@example.test',
	membershipId: 'membership_2',
	membershipStatus: 'active',
	role: 'collector',
} as unknown as PersonListing;

const HISTORICAL_PERSON = {
	profileId: 'profile_3',
	displayName: 'Lee Park',
	isActive: false,
	userId: null,
	email: null,
	membershipId: null,
	membershipStatus: null,
	role: null,
} as unknown as PersonListing;

// The Account's email is the text the first case finds the member card by.
const OWNER = signedInSnapshotWith({
	user: { email: 'owner@example.test' },
	localIdentity: { role: 'owner' },
});

const MEASURE = `.${CSS.escape('max-w-[46rem]')}`;

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('PeopleSection', () => {
	it('draws the member rows and the profile groups in one 46rem block', () => {
		const { container } = renderSection();

		const measures = container.querySelectorAll(MEASURE);
		expect(measures).toHaveLength(1);
		const block = measures[0];
		if (block === undefined) {
			throw new Error('no list block');
		}

		// The current member's card and every group under it sit inside the one
		// cap, so the rows share a right edge.
		expect(screen.getByText('owner@example.test').closest(MEASURE)).toBe(block);
		expect(screen.getByText('Sam Rivera').closest(MEASURE)).toBe(block);
		expect(screen.getByText('Lee Park').closest(MEASURE)).toBe(block);
		expect(screen.getByText('No inactive linked profiles').closest(MEASURE)).toBe(block);
		// Not centred: the block sits at the frame's left edge with the heading.
		expect(block.classList.contains('mx-auto')).toBe(false);
	});

	it('keeps the invite controls in the header above the cap', () => {
		renderSection();

		expect(screen.getByRole('button', { name: /invite/i }).closest(MEASURE)).toBeNull();
		expect(screen.getByRole('button', { name: /historical profile/i }).closest(MEASURE)).toBeNull();
	});
});

function renderSection() {
	// `role` is the Membership role, not an ARIA one. Biome's `useValidAriaRole`
	// reads a literal on any element, so it goes through a typed variable.
	const role: SimmerRole = 'owner';
	return render(<PeopleSection auth={OWNER} canManage={true} role={role} />);
}
