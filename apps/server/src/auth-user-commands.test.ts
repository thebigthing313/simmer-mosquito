import type { AuthenticatedSession } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AuthMailer } from './auth-email.js';
import type { AuthVariables } from './auth-middleware.js';
import { type AuthUserFlows, registerAuthUserRoutes } from './auth-user-commands.js';

const session: AuthenticatedSession = {
	authenticated: true,
	user: {
		workosUserId: 'workos_user_1',
		email: 'user@example.test',
		firstName: 'Uma',
		lastName: 'User',
		displayName: 'Uma User',
		emailVerified: true,
		profilePictureUrl: null,
	},
	workosOrganizationId: 'workos_org_1',
	sessionId: null,
	role: null,
	sealedSession: 'sealed',
};

function createApp(overrides: Partial<AuthUserFlows> = {}, mailer?: AuthMailer) {
	const auth: AuthUserFlows = {
		signInWithPassword: vi.fn(async () => ({ status: 'authenticated' as const, session })),
		signUpWithPassword: vi.fn(async () => ({ status: 'authenticated' as const, session })),
		verifyEmailCode: vi.fn(async () => ({ status: 'authenticated' as const, session })),
		requestPasswordReset: vi.fn(async () => null),
		resetPassword: vi.fn(async () => ({ status: 'ok' as const })),
		getInvitationByToken: vi.fn(async () => null),
		acceptInvitationWithPassword: vi.fn(async () => ({
			status: 'authenticated' as const,
			session,
		})),
		authenticateWithOrganizationSelection: vi.fn(async () => ({
			status: 'authenticated' as const,
			session,
		})),
		...overrides,
	};

	const finalizeSession = vi.fn(async () => ({ organizationRequired: false }));
	const resolvedMailer: AuthMailer = mailer ?? { sendPasswordResetEmail: vi.fn(async () => {}) };

	const app = new Hono<{ Variables: AuthVariables }>();
	registerAuthUserRoutes(app, {
		auth,
		mailer: resolvedMailer,
		appOrigin: 'https://app.example.test',
		finalizeSession,
	});

	return { app, auth, finalizeSession, mailer: resolvedMailer };
}

function postJson(app: Hono<{ Variables: AuthVariables }>, path: string, body: unknown) {
	return app.request(path, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
	});
}

describe('registerAuthUserRoutes', () => {
	it('finalizes the session and reports organizationRequired on sign-in', async () => {
		const { app, finalizeSession } = createApp({
			signInWithPassword: vi.fn(async () => ({ status: 'authenticated' as const, session })),
		});
		(finalizeSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			organizationRequired: true,
		});

		const response = await postJson(app, '/auth/sign-in', {
			email: 'user@example.test',
			password: 'sup3rsecret',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true, organizationRequired: true });
		expect(finalizeSession).toHaveBeenCalledWith(expect.anything(), session);
	});

	it('returns 401 on invalid credentials', async () => {
		const { app } = createApp({
			signInWithPassword: vi.fn(async () => ({ status: 'invalid_credentials' as const })),
		});

		const response = await postJson(app, '/auth/sign-in', {
			email: 'user@example.test',
			password: 'wrongpass1',
		});

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ ok: false, status: 'invalid_credentials' });
	});

	it('surfaces the pending token when email verification is required', async () => {
		const { app, finalizeSession } = createApp({
			signInWithPassword: vi.fn(async () => ({
				status: 'verification_required' as const,
				pendingAuthenticationToken: 'pat_123',
				email: 'user@example.test',
			})),
		});

		const response = await postJson(app, '/auth/sign-in', {
			email: 'user@example.test',
			password: 'sup3rsecret',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: false,
			status: 'verification_required' as const,
			pendingAuthenticationToken: 'pat_123',
			email: 'user@example.test',
		});
		expect(finalizeSession).not.toHaveBeenCalled();
	});

	it('returns 409 when signing up with a taken email', async () => {
		const { app } = createApp({
			signUpWithPassword: vi.fn(async () => ({ status: 'email_taken' as const })),
		});

		const response = await postJson(app, '/auth/sign-up', {
			email: 'taken@example.test',
			password: 'sup3rsecret',
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ ok: false, status: 'email_taken' });
	});

	it('rejects short sign-up passwords before calling WorkOS', async () => {
		const { app, auth } = createApp();

		const response = await postJson(app, '/auth/sign-up', {
			email: 'user@example.test',
			password: 'short',
		});

		expect(response.status).toBe(422);
		await expect(response.json()).resolves.toMatchObject({ ok: false, status: 'weak_password' });
		expect(auth.signUpWithPassword).not.toHaveBeenCalled();
	});

	it('always answers 200 to forgot-password and mails only when a reset exists', async () => {
		const sendPasswordResetEmail = vi.fn(async () => {});
		const { app } = createApp(
			{
				requestPasswordReset: vi.fn(async () => ({
					passwordResetToken: 'tok',
					email: 'u@example.test',
				})),
			},
			{ sendPasswordResetEmail },
		);

		const response = await postJson(app, '/auth/forgot-password', { email: 'u@example.test' });

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(sendPasswordResetEmail).toHaveBeenCalledWith({
			to: 'u@example.test',
			resetUrl: 'https://app.example.test/reset-password?token=tok',
		});
	});

	it('does not leak account existence when no reset is created', async () => {
		const sendPasswordResetEmail = vi.fn(async () => {});
		const { app } = createApp(
			{ requestPasswordReset: vi.fn(async () => null) },
			{ sendPasswordResetEmail },
		);

		const response = await postJson(app, '/auth/forgot-password', { email: 'nobody@example.test' });

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(sendPasswordResetEmail).not.toHaveBeenCalled();
	});

	it('rejects accepting a non-pending invitation', async () => {
		const acceptInvitationWithPassword = vi.fn(async () => ({
			status: 'authenticated' as const,
			session,
		}));
		const { app } = createApp({
			getInvitationByToken: vi.fn(async () => ({
				id: 'inv_1',
				email: 'invitee@example.test',
				state: 'expired' as const,
				organizationId: 'workos_org_1',
			})),
			acceptInvitationWithPassword,
		});

		const response = await postJson(app, '/auth/accept-invitation', {
			invitationToken: 'itok',
			password: 'sup3rsecret',
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ ok: false, status: 'invalid_invitation' });
		expect(acceptInvitationWithPassword).not.toHaveBeenCalled();
	});

	it('surfaces a verification challenge from accept-invitation instead of failing', async () => {
		const { app, finalizeSession } = createApp({
			getInvitationByToken: vi.fn(async () => ({
				id: 'inv_1',
				email: 'invitee@example.test',
				state: 'pending' as const,
				organizationId: 'workos_org_1',
			})),
			acceptInvitationWithPassword: vi.fn(async () => ({
				status: 'verification_required' as const,
				pendingAuthenticationToken: 'pat_invite',
				email: 'invitee@example.test',
			})),
		});

		const response = await postJson(app, '/auth/accept-invitation', {
			invitationToken: 'itok',
			password: 'sup3rsecret',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: false,
			status: 'verification_required',
			pendingAuthenticationToken: 'pat_invite',
			email: 'invitee@example.test',
		});
		expect(finalizeSession).not.toHaveBeenCalled();
	});

	it('surfaces the organization list when a multi-org user must choose', async () => {
		const { app, finalizeSession } = createApp({
			signInWithPassword: vi.fn(async () => ({
				status: 'organization_selection_required' as const,
				pendingAuthenticationToken: 'pat_org',
				organizations: [
					{ id: 'org_a', name: 'County A' },
					{ id: 'org_b', name: 'County B' },
				],
			})),
		});

		const response = await postJson(app, '/auth/sign-in', {
			email: 'multi@example.test',
			password: 'sup3rsecret',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: false,
			status: 'organization_selection_required',
			pendingAuthenticationToken: 'pat_org',
			organizations: [
				{ id: 'org_a', name: 'County A' },
				{ id: 'org_b', name: 'County B' },
			],
		});
		expect(finalizeSession).not.toHaveBeenCalled();
	});

	it('finalizes the session after an organization is selected', async () => {
		const authenticateWithOrganizationSelection = vi.fn(async () => ({
			status: 'authenticated' as const,
			session,
		}));
		const { app, finalizeSession } = createApp({ authenticateWithOrganizationSelection });

		const response = await postJson(app, '/auth/select-organization', {
			organizationId: 'org_b',
			pendingAuthenticationToken: 'pat_org',
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true, organizationRequired: false });
		expect(authenticateWithOrganizationSelection).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: 'org_b', pendingAuthenticationToken: 'pat_org' }),
		);
		expect(finalizeSession).toHaveBeenCalledWith(expect.anything(), session);
	});
});
