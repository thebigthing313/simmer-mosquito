import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../../../auth';
import {
	canManageCatalogs,
	canManageOperationalCatalogs,
	canPlanWork,
	canRemoveMember,
	canWriteRecords,
	hasAtLeastRole,
	isBelowRole,
	isWriteBlocked,
	readOrgRole,
} from '../../../lib/write-access';

function authWithRole(role: string | null): AuthMe {
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

describe('readOrgRole', () => {
	it('reads each known membership role', () => {
		for (const role of ['owner', 'admin', 'manager', 'collector', 'viewer'] as const) {
			expect(readOrgRole(authWithRole(role))).toBe(role);
		}
	});

	it('falls back to viewer for anything it cannot recognise', () => {
		// The fallback is the *least* privileged role on purpose: a failure to read
		// identity has to deny, never grant.
		expect(readOrgRole(null)).toBe('viewer');
		expect(readOrgRole(authWithRole(null))).toBe('viewer');
		expect(readOrgRole(authWithRole('superuser'))).toBe('viewer');
		expect(readOrgRole({ authenticated: false, reason: 'no session' })).toBe('viewer');
	});
});

describe('canWriteRecords', () => {
	it('admits every role that records field work', () => {
		for (const role of ['owner', 'admin', 'manager', 'collector'] as const) {
			expect(canWriteRecords(authWithRole(role))).toBe(true);
		}
	});

	it('refuses viewers, and anyone whose role could not be read', () => {
		expect(canWriteRecords(authWithRole('viewer'))).toBe(false);
		expect(canWriteRecords(null)).toBe(false);
		expect(canWriteRecords({ authenticated: false, reason: 'no session' })).toBe(false);
	});
});

describe('the role ladder', () => {
	// The point of the ladder is that these three answers differ. Before it, the
	// app had one predicate — viewer-or-not — and offered a collector every
	// planning screen in the product.
	it('separates recording from planning from configuring', () => {
		const floors = {
			owner: { write: true, plan: true, catalogs: true, operational: true },
			admin: { write: true, plan: true, catalogs: true, operational: true },
			manager: { write: true, plan: true, catalogs: false, operational: true },
			collector: { write: true, plan: false, catalogs: false, operational: false },
			viewer: { write: false, plan: false, catalogs: false, operational: false },
		} as const;

		for (const [role, expected] of Object.entries(floors)) {
			const auth = authWithRole(role);
			expect({
				write: canWriteRecords(auth),
				plan: canPlanWork(auth),
				catalogs: canManageCatalogs(auth),
				operational: canManageOperationalCatalogs(auth),
			}).toEqual(expected);
		}
	});

	// The row that #65 is about. A manager is `false` for `catalogs` and `true`
	// for `operational`, and the organization workspace used to read only the
	// first — so tags, vehicles, equipment and method edits were all withheld
	// from an account the server would have accepted.
	it('admits a manager to the operational catalogs it refuses them for configuration', () => {
		const manager = authWithRole('manager');

		expect(canManageCatalogs(manager)).toBe(false);
		expect(canManageOperationalCatalogs(manager)).toBe(true);
		expect(canManageOperationalCatalogs(authWithRole('collector'))).toBe(false);
	});

	it('orders the ladder the same way the server does', () => {
		// Mirrors `hasAtLeastRole` in `apps/server/src/roles.ts`. The two are
		// written down twice, so a test that pins the ordering is the only thing
		// keeping them from drifting apart quietly.
		expect(hasAtLeastRole(authWithRole('owner'), 'admin')).toBe(true);
		expect(hasAtLeastRole(authWithRole('admin'), 'admin')).toBe(true);
		expect(hasAtLeastRole(authWithRole('manager'), 'admin')).toBe(false);
		expect(hasAtLeastRole(authWithRole('manager'), 'manager')).toBe(true);
		expect(hasAtLeastRole(authWithRole('collector'), 'manager')).toBe(false);
		expect(hasAtLeastRole(authWithRole('collector'), 'collector')).toBe(true);
		expect(hasAtLeastRole(authWithRole('viewer'), 'collector')).toBe(false);
	});

	it('denies every floor when identity cannot be read', () => {
		for (const minimum of ['admin', 'manager', 'collector'] as const) {
			expect(hasAtLeastRole(null, minimum)).toBe(false);
			expect(hasAtLeastRole({ authenticated: false, reason: 'no session' }, minimum)).toBe(false);
		}
	});
});

describe('isBelowRole', () => {
	it('blocks a collector from a manager-and-above route', async () => {
		const context = { auth: { load: () => Promise.resolve(authWithRole('collector')) } };

		expect(await isBelowRole(context, 'manager')).toBe(true);
		expect(await isBelowRole(context, 'collector')).toBe(false);
	});

	it('blocks a manager from an owner/admin route', async () => {
		const context = { auth: { load: () => Promise.resolve(authWithRole('manager')) } };

		expect(await isBelowRole(context, 'admin')).toBe(true);
		expect(await isBelowRole(context, 'manager')).toBe(false);
	});
});

describe('isWriteBlocked', () => {
	it('awaits identity rather than reading a snapshot that may not exist yet', async () => {
		// The guard runs on cold loads — a pasted URL, a bookmark, a refresh — where
		// a synchronous snapshot read would be null and bounce everyone.
		let resolved = false;
		const context = {
			auth: {
				load: async (): Promise<AuthMe> => {
					await Promise.resolve();
					resolved = true;
					return authWithRole('collector');
				},
			},
		};

		expect(await isWriteBlocked(context)).toBe(false);
		expect(resolved).toBe(true);
	});

	it('blocks a viewer', async () => {
		const context = { auth: { load: () => Promise.resolve(authWithRole('viewer')) } };
		expect(await isWriteBlocked(context)).toBe(true);
	});
});

describe('canRemoveMember', () => {
	const other = { id: 'membership_2', role: 'manager' } as const;

	it('is the people floor, not the role floor', () => {
		expect(canRemoveMember(authWithRole('admin'), other)).toBe(true);
		expect(canRemoveMember(authWithRole('manager'), other)).toBe(false);
		expect(canRemoveMember(authWithRole('viewer'), other)).toBe(false);
	});

	// The bound the server applies too: "admins may remove" without it would be
	// "admins may remove every owner", and an organization with no owner cannot
	// appoint one.
	it('does not offer removing somebody above your own role', () => {
		expect(canRemoveMember(authWithRole('admin'), { id: 'membership_2', role: 'owner' })).toBe(
			false,
		);
		expect(canRemoveMember(authWithRole('owner'), { id: 'membership_2', role: 'owner' })).toBe(
			true,
		);
	});

	// `authWithRole` is membership_1. Leaving is a different act with a different
	// confirmation, and this control is not it.
	it('never offers removing yourself', () => {
		expect(canRemoveMember(authWithRole('owner'), { id: 'membership_1', role: 'owner' })).toBe(
			false,
		);
	});
});
