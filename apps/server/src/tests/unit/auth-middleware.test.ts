import type { AuthUser } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { type AuthVariables, createOperatorAuthContextMiddleware } from '../../auth-middleware.js';

const operatorUser: AuthUser = {
	workosUserId: 'workos_user_operator',
	email: 'operator@example.com',
	firstName: 'Opal',
	lastName: 'Operator',
	displayName: 'Opal Operator',
	emailVerified: true,
	profilePictureUrl: null,
};

describe('createOperatorAuthContextMiddleware', () => {
	it('allows operator email without selected organization or local membership', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		const localResolver = vi.fn();

		app.use(
			'/admin/*',
			createOperatorAuthContextMiddleware({
				auth: {
					authenticateSession: async () => ({
						authenticated: true,
						user: operatorUser,
						workosOrganizationId: null,
						sessionId: 'session-1',
						role: null,
					}),
				},
				localIdentityResolver: {
					resolveActiveLocalAuthIdentity: localResolver,
				},
				isOperatorEmail: (email) => email === operatorUser.email,
				setAuthCookie: vi.fn(),
			}),
		);
		app.get('/admin/organizations', (context) =>
			context.json({
				email: context.get('operatorContext').workosUser.email,
				organizationId: context.get('operatorContext').workosOrganizationId,
			}),
		);

		const response = await app.request('/admin/organizations');

		await expect(response.json()).resolves.toEqual({
			email: operatorUser.email,
			organizationId: null,
		});
		expect(response.status).toBe(200);
		expect(localResolver).not.toHaveBeenCalled();
	});

	it('rejects authenticated non-operator email', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();

		app.use(
			'/admin/*',
			createOperatorAuthContextMiddleware({
				auth: {
					authenticateSession: async () => ({
						authenticated: true,
						user: { ...operatorUser, email: 'viewer@example.com' },
						workosOrganizationId: null,
						sessionId: 'session-1',
						role: null,
					}),
				},
				localIdentityResolver: {
					resolveActiveLocalAuthIdentity: vi.fn(),
				},
				isOperatorEmail: (email) => email === operatorUser.email,
				setAuthCookie: vi.fn(),
			}),
		);
		app.get('/admin/organizations', (context) => context.json({ ok: true }));

		const response = await app.request('/admin/organizations');

		await expect(response.json()).resolves.toEqual({ error: 'operator_required' });
		expect(response.status).toBe(403);
	});
});
