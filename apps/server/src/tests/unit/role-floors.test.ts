import type { SimmerRole } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerOrganizationCommandRoutes } from '../../organization-commands.js';
import { registerOrganizationSettingsCommandRoutes } from '../../organization-settings-commands.js';
import { registerProfileCommandRoutes } from '../../profile-commands.js';
import { canGrantRole, hasAtLeastRole } from '../../roles.js';

// --- the floors outside the permission map -----------------------------------
//
// `COMMAND_PERMISSIONS` is total: a new agency command cannot be added without
// deciding who may send it, because the build fails until it appears there.
// These three modules are outside it — their commands are not `AgencyCommandType`
// — so nothing forced them to declare a floor, and #121 found all three had
// written the ladder out again by hand instead. They also had zero tests across
// 1,109 lines.
//
// `unusableDb` throws on `transaction()`, so every refusal below also proves the
// refusal happened before the database was opened.

describe('hasAtLeastRole', () => {
	it.each([
		['owner', 'owner', true],
		['admin', 'owner', false],
		['manager', 'owner', false],
		['owner', 'admin', true],
		['admin', 'admin', true],
		['manager', 'admin', false],
		['manager', 'manager', true],
		['collector', 'manager', false],
		['collector', 'collector', true],
		['viewer', 'collector', false],
	] as const)('%s meets the %s floor: %s', (role, minimum, expected) => {
		expect(hasAtLeastRole(role, minimum)).toBe(expected);
	});
});

describe('canGrantRole', () => {
	// The reason an admin may invite at all: an invitation names a role, so
	// "admins may invite" without this would be "admins may mint an owner" — the
	// self-promotion the role-change floor exists to refuse, reached by inviting
	// a second account instead.
	it('lets nobody hand out a role above their own', () => {
		expect(canGrantRole('admin', 'owner')).toBe(false);
		expect(canGrantRole('manager', 'admin')).toBe(false);
		expect(canGrantRole('collector', 'manager')).toBe(false);
	});

	it('lets an actor hand out their own role and below', () => {
		expect(canGrantRole('owner', 'owner')).toBe(true);
		expect(canGrantRole('admin', 'admin')).toBe(true);
		expect(canGrantRole('admin', 'manager')).toBe(true);
		expect(canGrantRole('admin', 'viewer')).toBe(true);
	});
});

describe('organization details', () => {
	it.each(['manager', 'collector', 'viewer'] as const)('refuses a %s', async (role) => {
		const response = await patch(role, '/organization/current', { name: 'Coastal MAD' });

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it.each(['owner', 'admin'] as const)('admits a %s past the floor', async (role) => {
		const response = await patch(role, '/organization/current', { name: 'Coastal MAD' });

		// Past the guard the unusable database throws and Hono answers 500. That
		// is the assertion: reaching the database is the proof, and a 403 here
		// would mean the floor is too high.
		expect(response.status).toBe(500);
	});
});

describe('organization settings', () => {
	it.each(['manager', 'collector', 'viewer'] as const)('refuses a %s', async (role) => {
		const response = await patch(role, '/organization-settings/timezone', {
			timezone: 'America/Chicago',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it('refuses before the body is read, so nothing is learned about the payload', async () => {
		const app = createApp('viewer');
		const response = await app.request('/organization-settings/timezone', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: 'not json at all',
		});

		// A 400 here would mean the payload was parsed first, telling an
		// unauthorized caller which fields a valid body would have had.
		expect(response.status).toBe(403);
	});
});

describe('people', () => {
	const profileId = 'a1f0c2d3-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
	const membershipId = 'b2e1d3c4-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

	it.each([
		'manager',
		'collector',
		'viewer',
	] as const)('refuses a %s managing people', async (role) => {
		const response = await post(role, '/organization/profiles', {
			id: profileId,
			displayName: 'Dana Field',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	// The floor #121 settled: an agency delegates onboarding rather than routing
	// every new crew member through one person.
	it('admits an admin managing people', async () => {
		const response = await post('admin', '/organization/profiles', {
			id: profileId,
			displayName: 'Dana Field',
		});

		expect(response.status).toBe(500);
	});

	it.each([
		'admin',
		'manager',
		'collector',
		'viewer',
	] as const)('refuses a %s changing a role', async (role) => {
		const response = await patch(role, `/organization/memberships/${membershipId}/role`, {
			role: 'manager',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	// ADR 0011's offboarding lifecycle. Removal sits on the people floor rather
	// than the role floor — an office manager offboards a seasonal crew member —
	// but it carries the invitation's bound, so the floor alone is not the whole
	// rule.
	it.each([
		'manager',
		'collector',
		'viewer',
	] as const)('refuses a %s removing a member', async (role) => {
		const response = await remove(role, `/organization/memberships/${membershipId}`);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it('admits an admin removing a member', async () => {
		const response = await remove('admin', `/organization/memberships/${membershipId}`);

		expect(response.status).toBe(500);
	});

	// Without the bound, "admins may remove" is "admins may remove every owner",
	// and an agency with no owner cannot appoint one.
	it('refuses an admin removing an owner', async () => {
		const response = await remove(
			'admin',
			`/organization/memberships/${membershipId}`,
			membershipDb({ role: 'owner', status: 'active' }),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: 'forbidden',
			reason: 'You cannot remove somebody above your own role.',
		});
	});

	// The membership the request carries is the actor's own, so this is the
	// self-removal refusal — asserted here because only the route knows which
	// membership is the caller's.
	it('refuses removing your own membership', async () => {
		const response = await remove(
			'owner',
			`/organization/memberships/${ACTOR_MEMBERSHIP_ID}`,
			membershipDb({ role: 'owner', status: 'active' }),
		);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: 'membership_is_self' });
	});

	// The escalation the two floors exist to close: refused at the role endpoint,
	// an admin must not reach the same place by inviting an owner instead.
	it('refuses an admin inviting an owner', async () => {
		const response = await post('admin', '/organization/invitations', {
			email: 'someone@example.test',
			displayName: 'Someone Else',
			role: 'owner',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: 'forbidden',
			reason: 'You cannot invite somebody above your own role.',
		});
	});
});

function createApp(role: SimmerRole, db: unknown = unusableDb): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	const authContextMiddleware = createMiddleware<{ Variables: AuthVariables }>(
		async (context, next) => {
			context.set('authContext', authContextFor(role));
			await next();
		},
	);

	registerOrganizationCommandRoutes(app, { db: unusableDb as never, authContextMiddleware });
	registerOrganizationSettingsCommandRoutes(app, {
		db: unusableDb as never,
		authContextMiddleware,
	});
	registerProfileCommandRoutes(app, {
		db: db as never,
		auth: unusableAuth as never,
		authContextMiddleware,
	});

	return app;
}

async function remove(role: SimmerRole, path: string, db?: unknown): Promise<Response> {
	return createApp(role, db ?? unusableDb).request(path, { method: 'DELETE' });
}

async function patch(role: SimmerRole, path: string, body: unknown): Promise<Response> {
	return createApp(role).request(path, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function post(role: SimmerRole, path: string, body: unknown): Promise<Response> {
	return createApp(role).request(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

const unusableDb = {
	transaction: () => {
		throw new Error('The database must not be reached for an unauthorized command.');
	},
};

/** Invitations and removals are side effects on WorkOS; a refusal must not reach either. */
const unusableAuth = {
	sendOrganizationInvitation: () => {
		throw new Error('WorkOS must not be reached for an unauthorized invitation.');
	},
	deactivateOrganizationMembership: () => {
		throw new Error('WorkOS must not be reached for an unauthorized removal.');
	},
};

/**
 * A database that answers `readMembershipRemovalTarget` and nothing else.
 *
 * The rank bound on removal is the one refusal that cannot be reached with
 * `unusableDb`: it needs to know the target's role, which is a read. Every
 * builder method returns the same object, so the two queries differ only in how
 * they finish — `executeTakeFirst` for the membership, `executeTakeFirstOrThrow`
 * for the active-owner count.
 */
function membershipDb(target: { readonly role: SimmerRole; readonly status: string }) {
	const builder: Record<string, unknown> = new Proxy(
		{},
		{
			get(_unused, property) {
				if (property === 'executeTakeFirst') {
					return async () => ({
						id: 'b2e1d3c4-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
						role: target.role,
						status: target.status,
						user_id: null,
						workos_user_id: null,
					});
				}
				if (property === 'executeTakeFirstOrThrow') {
					return async () => ({ count: 2 });
				}
				return () => builder;
			},
		},
	);

	return {
		selectFrom: () => builder,
		transaction: () => {
			throw new Error('The database must not be written to for a refused removal.');
		},
	};
}

const ACTOR_MEMBERSHIP_ID = 'c3d2e1f0-6a5b-4c7d-8e9f-1a2b3c4d5e6f';

function authContextFor(role: SimmerRole): AuthContext {
	return {
		organization: {
			id: 'f0dbf1c7-d278-441e-82b4-9292d390ce72',
			workosOrganizationId: 'org_test',
		},
		profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
		membership: { id: ACTOR_MEMBERSHIP_ID },
		workosUser: { workosUserId: 'user_test' },
		role,
	} as AuthContext;
}
