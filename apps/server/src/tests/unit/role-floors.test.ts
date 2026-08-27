import type { SimmerRole } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerOrganizationSettingsCommandRoutes } from '../../organization-settings-commands.js';
import { registerProfileCommandRoutes } from '../../profile-commands.js';
import { canGrantRole, hasAtLeastRole } from '../../roles.js';
import { registerTableCommandSurface } from '../../table-commands/index.js';

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

// Since ADR 0013's first slice these are commands, so their floor is the
// exhaustive `COMMAND_PERMISSIONS` rather than the identity table. Asserted here
// anyway, through the routes a browser actually posts to: the map being total
// says a floor exists, not that dispatch consults it before opening the
// database.
describe('organization details', () => {
	const detailsPath = `/commands/organizations/${ORGANIZATION_ID}`;
	const details = {
		intents: ['identity.updateOrganizationDetails'],
		name: 'Coastal MAD',
	};

	it.each(['manager', 'collector', 'viewer'] as const)('refuses a %s', async (role) => {
		const response = await patch(role, detailsPath, details);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it.each(['owner', 'admin'] as const)('admits a %s past the floor', async (role) => {
		const response = await patch(role, detailsPath, details);

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
		const response = await post(role, '/commands/profiles', {
			intents: ['identity.createProfile'],
			id: profileId,
			display_name: 'Dana Field',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	// The floor #121 settled: an agency delegates onboarding rather than routing
	// every new crew member through one person.
	it('admits an admin managing people', async () => {
		const response = await post('admin', '/commands/profiles', {
			intents: ['identity.createProfile'],
			id: profileId,
			display_name: 'Dana Field',
		});

		expect(response.status).toBe(500);
	});

	it.each([
		'admin',
		'manager',
		'collector',
		'viewer',
	] as const)('refuses a %s changing a role', async (role) => {
		const response = await patch(role, `/commands/memberships/${membershipId}`, {
			intents: ['identity.changeRole'],
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
		const response = await endMembership(role, membershipId);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it('admits an admin removing a member', async () => {
		const response = await endMembership('admin', membershipId);

		expect(response.status).toBe(500);
	});

	// Without the bound, "admins may remove" is "admins may remove every owner",
	// and an agency with no owner cannot appoint one.
	it('refuses an admin removing an owner', async () => {
		const response = await endMembership(
			'admin',
			membershipId,
			membershipDb({ role: 'owner', status: 'active' }),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: 'forbidden',
			reason: 'You cannot remove somebody above your own role.',
		});
	});

	// The membership the request carries is the actor's own, so this is the
	// self-removal refusal — asserted here because only `AuthContext` knows which
	// membership belongs to the caller.
	it('refuses removing your own membership', async () => {
		const response = await endMembership(
			'owner',
			ACTOR_MEMBERSHIP_ID,
			membershipDb({ role: 'owner', status: 'active' }),
		);

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: 'membership_is_self' });
	});

	// The escalation the two floors exist to close: refused at the role command,
	// an admin must not reach the same place by inviting an owner instead.
	it('refuses an admin inviting an owner', async () => {
		const response = await post('admin', '/commands/memberships', {
			intents: ['identity.invite'],
			id: membershipId,
			profile_id: profileId,
			invited_email: 'someone@example.test',
			display_name: 'Someone Else',
			role: 'owner',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: 'forbidden',
			reason: 'You cannot invite somebody above your own role.',
		});
	});

	// A re-invitation names a role too, and reaches the same rung the same way.
	it('refuses an admin re-inviting somebody as an owner', async () => {
		const response = await patch('admin', `/commands/memberships/${membershipId}`, {
			intents: ['identity.reinvite'],
			role: 'owner',
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: 'forbidden',
			reason: 'You cannot re-invite somebody above your own role.',
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

	registerTableCommandSurface(app, {
		db: db as never,
		auth: unusableAuth as never,
		authContextMiddleware,
		operatorAuthContextMiddleware: authContextMiddleware,
	});
	registerOrganizationSettingsCommandRoutes(app, {
		db: unusableDb as never,
		authContextMiddleware,
	});
	registerProfileCommandRoutes(app, { db: db as never, authContextMiddleware });

	return app;
}

/**
 * Ending access, as the PATCH it is.
 *
 * The row survives at `inactive`, so this is not a DELETE, and the `status` a
 * client sends moves its optimistic row rather than telling the server anything.
 */
async function endMembership(
	role: SimmerRole,
	membershipId: string,
	db?: unknown,
): Promise<Response> {
	return createApp(role, db ?? unusableDb).request(`/commands/memberships/${membershipId}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ intents: ['identity.endMembership'], status: 'inactive' }),
	});
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
	selectFrom: () => {
		throw new Error('The database must not be reached for an unauthorized command.');
	},
};

/** Every WorkOS call these commands make is a side effect; a refusal must reach none of them. */
const unusableAuth = {
	sendOrganizationInvitation: () => {
		throw new Error('WorkOS must not be reached for an unauthorized invitation.');
	},
	revokeInvitation: () => {
		throw new Error('WorkOS must not be reached for an unauthorized re-invitation.');
	},
	deactivateOrganizationMembership: () => {
		throw new Error('WorkOS must not be reached for an unauthorized removal.');
	},
};

/**
 * A database that answers the two reads `identity.endMembership` makes before it
 * writes, and nothing else.
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
const ORGANIZATION_ID = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';

function authContextFor(role: SimmerRole): AuthContext {
	return {
		organization: {
			id: ORGANIZATION_ID,
			workosOrganizationId: 'org_test',
		},
		profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
		membership: { id: ACTOR_MEMBERSHIP_ID },
		workosUser: { workosUserId: 'user_test' },
		role,
	} as AuthContext;
}
