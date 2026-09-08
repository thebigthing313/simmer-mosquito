import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../../../auth';
import {
	isBelowWriteFloor,
	WRITE_SURFACE_FLOORS,
	writeSurfaceFloor,
} from '../../../lib/write-surfaces';

/**
 * The register the sidebar, the route guards and the map menu all read.
 *
 * `write-access.test.ts` pins the ladder; this pins that a surface's floor is
 * one fact. The three merge surfaces are the cases #623 is about: their entry
 * points knew the floor and their routes did not, so a Collector filled the
 * form in and met the refusal at the save.
 */
describe('writeSurfaceFloor', () => {
	it('floors the three merge surfaces at manager, matching the server', () => {
		// `foundation.mergeAddresses`, `larvalSurveillance.mergeHabitats` and
		// `publicEngagement.mergeContacts` are all MANAGER in
		// `apps/server/src/command-permissions.ts`.
		expect(writeSurfaceFloor('/gis/addresses/cleanup')).toBe('manager');
		expect(writeSurfaceFloor('/public-engagement/contacts/cleanup')).toBe('manager');
		expect(writeSurfaceFloor('/larval-surveillance/habitats/$id/merge')).toBe('manager');
	});

	it('has nothing to say about a route that is not a write surface', () => {
		expect(writeSurfaceFloor('/gis/addresses')).toBeUndefined();
		expect(writeSurfaceFloor('/larval-surveillance/habitats/$id')).toBeUndefined();
	});

	// Creating an address is field entry, and it is the one GIS form a collector
	// reaches. Editing and merging one stay at manager.
	it('keeps the address book split across two floors', () => {
		expect(writeSurfaceFloor('/gis/addresses/create')).toBe('collector');
		expect(writeSurfaceFloor('/gis/addresses/$id/edit')).toBe('manager');
	});
});

describe('isBelowWriteFloor', () => {
	it('refuses a collector the merge surfaces and admits a manager', async () => {
		for (const path of [
			'/gis/addresses/cleanup',
			'/public-engagement/contacts/cleanup',
			'/larval-surveillance/habitats/$id/merge',
		] as const) {
			expect(await isBelowWriteFloor(contextFor('collector'), path)).toBe(true);
			expect(await isBelowWriteFloor(contextFor('manager'), path)).toBe(false);
		}
	});

	it('refuses a viewer every surface in the register', async () => {
		const context = contextFor('viewer');

		for (const path of Object.keys(WRITE_SURFACE_FLOORS)) {
			expect(await isBelowWriteFloor(context, path as keyof typeof WRITE_SURFACE_FLOORS)).toBe(
				true,
			);
		}
	});
});

function contextFor(role: string) {
	return { auth: { load: () => Promise.resolve(authWithRole(role)) } };
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
