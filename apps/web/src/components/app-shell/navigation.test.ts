import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../../auth';
import { shellDomainsForRole } from './navigation';

/**
 * The sidebar's half of the role ladder.
 *
 * `lib/write-access.test.ts` pins the ladder itself; this pins that the
 * navigation reads it. The two failure modes are opposite and both bad: an item
 * shown above its floor is a door that closes in the user's face, and an item
 * hidden below one takes work away from an account entitled to it.
 */
describe('shellDomainsForRole', () => {
	it('offers a collector the recording forms and none of the planning ones', () => {
		const paths = formPathsFor('collector');

		expect(paths).toContain('/larval-surveillance/inspections/create');
		expect(paths).toContain('/adult-surveillance/collections/create');
		expect(paths).toContain('/control-operations/chemical/create');
		expect(paths).toContain('/public-engagement/outreach/create');

		expect(paths).not.toContain('/larval-surveillance/habitats/create');
		expect(paths).not.toContain('/adult-surveillance/traps/create');
		expect(paths).not.toContain('/public-engagement/contacts/create');
		expect(paths).not.toContain('/public-engagement/service-requests/create');
		expect(paths).not.toContain('/gis/regions/create');
		expect(paths).not.toContain('/gis/regions/import');
	});

	it('offers a manager every form', () => {
		expect(formPathsFor('manager')).toEqual(formPathsFor('owner'));
	});

	it('offers a viewer none of them', () => {
		expect(formPathsFor('viewer')).toEqual([]);
	});

	it('offers an unreadable identity none of them', () => {
		expect(formPaths(shellDomainsForRole(null))).toEqual([]);
	});

	it('leaves the read-only navigation intact for every role', () => {
		// Only form destinations are filtered. A viewer still reaches every list,
		// map, and detail page, which is the whole point of the role.
		const viewerItems = allPathsFor('viewer');

		expect(viewerItems).toContain('/larval-surveillance/habitats');
		expect(viewerItems).toContain('/adult-surveillance/traps');
		expect(viewerItems).toContain('/public-engagement/service-requests');
	});

	it('drops no group or domain to an empty heading', () => {
		for (const role of ['owner', 'manager', 'collector', 'viewer'] as const) {
			for (const domain of shellDomainsForRole(authWithRole(role))) {
				expect(domain.groups.length).toBeGreaterThan(0);
				for (const group of domain.groups) {
					expect(group.items.length).toBeGreaterThan(0);
				}
			}
		}
	});
});

function formPathsFor(role: string): readonly string[] {
	return formPaths(shellDomainsForRole(authWithRole(role)));
}

function formPaths(domains: ReturnType<typeof shellDomainsForRole>): readonly string[] {
	return domains
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.filter((item) => item.write !== undefined)
		.map((item) => String(item.to));
}

function allPathsFor(role: string): readonly string[] {
	return shellDomainsForRole(authWithRole(role))
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.map((item) => String(item.to));
}

function authWithRole(role: string): AuthMe {
	return {
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
			role,
		},
	};
}
