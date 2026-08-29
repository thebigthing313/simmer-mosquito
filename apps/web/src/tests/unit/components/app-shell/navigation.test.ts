import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../../../../auth';
import { shellDomainsForRole } from '../../../../components/app-shell/navigation';

/**
 * The sidebar's half of the role ladder.
 *
 * `lib/write-access.test.ts` pins the ladder itself; this pins that the
 * navigation reads it. The two failure modes are opposite and both bad: an item
 * shown above its floor is a door that closes in the user's face, and an item
 * hidden below one takes work away from an account entitled to it.
 */
describe('shellDomainsForRole', () => {
	it('gives every create route exactly one navigation item', () => {
		// The gap this closes: `/gis/addresses/create` and `/gis/weather/create`
		// shipped with no sidebar item and were reachable only by typing the URL
		// (#270). Pinning the ladder per item never caught it, because an item that
		// does not exist has no floor to be wrong. The route list is read off the
		// generated route tree rather than written out here, since a hand-written
		// one goes stale the same way the sidebar did.
		const items = shellDomainsForRole(authWithRole('owner'))
			.flatMap((domain) => domain.groups)
			.flatMap((group) => group.items);
		const paths = createRoutePaths();

		// Without this the assertion below passes on an empty list, which is what a
		// rename of the generated file or of its import shape would produce.
		expect(paths.length).toBeGreaterThan(0);
		for (const path of paths) {
			expect(items.filter((item) => String(item.to) === path).map((item) => item.id)).toHaveLength(
				1,
			);
		}
	});

	it('offers a collector the recording forms and none of the planning ones', () => {
		const paths = formPathsFor('collector');

		expect(paths).toContain('/larval-surveillance/inspections/create');
		// The GIS exception. A collector entering a field record needs to name a
		// location the address book does not hold yet, so `foundation.createAddress`
		// sits at collector while every other address command sits at manager.
		expect(paths).toContain('/gis/addresses/create');
		expect(paths).toContain('/adult-surveillance/collections/create');
		expect(paths).toContain('/control-operations/chemical/create');
		expect(paths).toContain('/public-engagement/outreach/create');
		// Raising a request is field entry — a collector who finds a site needing
		// control says so. Planning what to do about it is not.
		expect(paths).toContain('/operations/requests-for-control/create');

		expect(paths).not.toContain('/larval-surveillance/habitats/create');
		expect(paths).not.toContain('/adult-surveillance/traps/create');
		expect(paths).not.toContain('/public-engagement/contacts/create');
		expect(paths).not.toContain('/public-engagement/service-requests/create');
		expect(paths).not.toContain('/gis/regions/create');
		expect(paths).not.toContain('/gis/weather/create');
		expect(paths).not.toContain('/gis/regions/import');
		expect(paths).not.toContain('/operations/assignments/create');
		expect(paths).not.toContain('/operations/missions/create');
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
		expect(viewerItems).toContain('/operations');
		expect(viewerItems).toContain('/operations/requests-for-control');
		expect(viewerItems).toContain('/operations/assignments');
		expect(viewerItems).toContain('/operations/missions');
	});

	it('orders the operations groups the way the work moves through them', () => {
		// A request is raised before anything is scheduled against it, so the
		// sidebar reads requests → assignments → missions rather than alphabetically
		// or by what happened to be built first.
		const operations = shellDomainsForRole(authWithRole('owner')).find(
			(domain) => domain.id === 'operations',
		);

		expect(operations?.groups.map((group) => group.label)).toEqual([
			undefined,
			'Requests for Control',
			'Surveillance Assignments',
			'Control Missions',
		]);
	});

	it('groups GIS by the kind of reference data, not one flat list', () => {
		// Addresses and weather each own a group because each has more than one
		// screen. A flat list put "Address Book" and "Weather" beside "Data Map"
		// and left nowhere for their second screens to go.
		const gis = shellDomainsForRole(authWithRole('owner')).find((domain) => domain.id === 'gis');

		expect(gis?.groups.map((group) => group.label)).toEqual([
			undefined,
			'Regions',
			'Addresses',
			'Weather',
		]);
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

/**
 * Every `create.tsx` route, read off the generated route tree.
 *
 * The tree is parsed as text rather than imported: importing it pulls in every
 * route module and the whole component tree behind them, which is a browser
 * bundle, not something a unit test can load.
 */
function createRoutePaths(): readonly string[] {
	const tree = readFileSync(
		fileURLToPath(new URL('../../../../routeTree.gen.ts', import.meta.url)),
		'utf8',
	);

	return [...tree.matchAll(/from '\.\/routes\/([\w\-/]+)\/create'/g)].flatMap((match) =>
		match[1] === undefined ? [] : [`/${match[1]}/create`],
	);
}

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
