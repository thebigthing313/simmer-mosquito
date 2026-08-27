import type { AuthUser } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { LocalAuthIdentityResolver } from '../../auth-context.js';
import { type AuthVariables, createOperatorAuthContextMiddleware } from '../../auth-middleware.js';

type ResolveLocalIdentity = LocalAuthIdentityResolver['resolveActiveLocalAuthIdentity'];

const SIMMER_ORG = 'org_simmer';

const operatorUser: AuthUser = {
	workosUserId: 'workos_user_operator',
	email: 'operator@example.com',
	firstName: 'Opal',
	lastName: 'Operator',
	displayName: 'Opal Operator',
	emailVerified: true,
	profilePictureUrl: null,
};

function operatorApp(session: {
	readonly user?: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly operatorOrganizationId?: string | null;
	readonly localResolver?: ResolveLocalIdentity;
}): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();

	app.use(
		'/admin/*',
		createOperatorAuthContextMiddleware({
			auth: {
				authenticateSession: async () => ({
					authenticated: true,
					user: session.user ?? operatorUser,
					workosOrganizationId: session.workosOrganizationId,
					sessionId: 'session-1',
					role: null,
				}),
			},
			localIdentityResolver: {
				resolveActiveLocalAuthIdentity:
					session.localResolver ?? vi.fn<ResolveLocalIdentity>(async () => null),
			},
			operatorOrganizationId:
				session.operatorOrganizationId === undefined ? SIMMER_ORG : session.operatorOrganizationId,
			setAuthCookie: vi.fn(),
		}),
	);
	app.get('/admin/organizations', (context) =>
		context.json({ organizationId: context.get('operatorContext').workosOrganizationId }),
	);

	return app;
}

/**
 * An operator is someone signed in as SIMMER, which is one WorkOS organization.
 *
 * The check used to be an allowlist of email addresses. These cases are what an
 * address could not answer: it is a property of the person, so it stayed true
 * across a change of session.
 */
describe('createOperatorAuthContextMiddleware', () => {
	it('admits a session in the SIMMER organization', async () => {
		const response = await operatorApp({ workosOrganizationId: SIMMER_ORG }).request(
			'/admin/organizations',
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ organizationId: SIMMER_ORG });
	});

	it('refuses the same person while they are inside an agency', async () => {
		// The case an email allowlist got wrong. An operator may hold an agency
		// membership (ADR 0011), and while their session is that agency's they are
		// acting as a member of it — the console is not theirs to reach until they
		// switch back.
		const response = await operatorApp({ workosOrganizationId: 'org_an_agency' }).request(
			'/admin/organizations',
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ error: 'operator_required' });
	});

	it('refuses a session that has selected no organization at all', async () => {
		const response = await operatorApp({ workosOrganizationId: null }).request(
			'/admin/organizations',
		);

		expect(response.status).toBe(403);
	});

	it('refuses everyone when no SIMMER organization is configured', async () => {
		// Fails closed: an unconfigured server has no operators rather than no check.
		// A `null` session organization must not match a `null` setting either.
		for (const organizationId of [SIMMER_ORG, null]) {
			const response = await operatorApp({
				workosOrganizationId: organizationId,
				operatorOrganizationId: null,
			}).request('/admin/organizations');

			expect({ organizationId, status: response.status }).toEqual({ organizationId, status: 403 });
		}
	});

	it('names the unconfigured case apart from the wrong-organization one', async () => {
		// Both refuse, and both are 403, but the fixes are opposites: one is
		// answered by signing in as SIMMER, the other cannot be answered by signing
		// in at all. The console renders the two codes as different screens, and
		// under one code it told an operator to retry something that could not work.
		const unconfigured = await operatorApp({
			workosOrganizationId: SIMMER_ORG,
			operatorOrganizationId: null,
		}).request('/admin/organizations');

		await expect(unconfigured.json()).resolves.toEqual({ error: 'operator_not_configured' });
	});

	it('resolves the local identity against the organization it admitted', async () => {
		const localResolver = vi.fn<ResolveLocalIdentity>(async () => null);

		await operatorApp({ workosOrganizationId: SIMMER_ORG, localResolver }).request(
			'/admin/organizations',
		);

		expect(localResolver).toHaveBeenCalledWith({
			workosUserId: operatorUser.workosUserId,
			workosOrganizationId: SIMMER_ORG,
		});
	});
});
