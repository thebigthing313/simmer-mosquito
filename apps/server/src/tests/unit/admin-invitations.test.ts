import type { AuthUser } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type AdminInvitationAuth,
	registerAdminInvitationRoutes,
} from '../../admin-invitations.js';
import type { AuthVariables, OperatorAuthContext } from '../../auth-middleware.js';

const dbMock = vi.hoisted(() => {
	class StageOrganizationInvitationError extends Error {
		readonly code: string;

		constructor(code: string) {
			super(code);
			this.name = 'StageOrganizationInvitationError';
			this.code = code;
		}
	}

	return {
		StageOrganizationInvitationError,
		assertOrganizationProfileCanBeInvited: vi.fn(),
		getOperatorOrganization: vi.fn(),
		stageOrganizationInvitation: vi.fn(),
		stampOrganizationInvitation: vi.fn(),
	};
});

vi.mock('@simmer-mosquito/db', () => dbMock);

const operatorUser: AuthUser = {
	workosUserId: 'workos_user_operator',
	email: 'operator@example.com',
	firstName: 'Opal',
	lastName: 'Operator',
	displayName: 'Opal Operator',
	emailVerified: true,
	profilePictureUrl: null,
};

const sentInvitation = {
	id: 'inv_1',
	email: 'casey@example.test',
	state: 'pending' as const,
	organizationId: 'workos_org_1',
	acceptedUserId: null,
	expiresAt: '2026-05-17T00:00:00.000Z',
	createdAt: '2026-05-16T00:00:00.000Z',
	updatedAt: '2026-05-16T00:00:00.000Z',
};

const invitedMembership = {
	id: 'membership-1',
	organizationId: 'org-1',
	userId: null,
	profileId: 'profile-existing',
	role: 'manager',
	status: 'invited',
	isDefault: false,
	invitedEmail: 'casey@example.test',
	workosInvitationId: 'inv_1',
	profile: {
		displayName: 'Casey Historical',
		email: 'casey@example.test',
		isActive: true,
	},
	createdAt: new Date('2026-05-01T00:00:00.000Z'),
	updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};

describe('registerAdminInvitationRoutes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbMock.getOperatorOrganization.mockResolvedValue({
			id: 'org-1',
			workosOrganizationId: 'workos_org_1',
			name: 'County Mosquito',
			slug: 'county',
			subscription: {
				subscriptionStatus: 'trial',
				billingMode: 'manual_invoice',
				billingContactName: null,
				billingContactEmail: null,
				subscriptionNotes: null,
			},
			contact: {
				mainContactEmail: null,
				phoneNumber: null,
				mailingCountry: null,
				mailingAddressLine1: null,
				mailingAddressLine2: null,
				mailingLocality: null,
				mailingRegion: null,
				mailingPostalCode: null,
			},
			ownerLinked: false,
			createdAt: new Date('2026-05-01T00:00:00.000Z'),
			updatedAt: new Date('2026-05-01T00:00:00.000Z'),
		});
		dbMock.stageOrganizationInvitation.mockResolvedValue({
			...invitedMembership,
			workosInvitationId: null,
		});
		dbMock.stampOrganizationInvitation.mockResolvedValue(invitedMembership);
	});

	it('passes profileId through existing-profile invitation flow', async () => {
		const auth = createFakeInvitationAuth();
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({
				email: 'casey@example.test',
				role: 'manager',
				profileId: 'profile-existing',
			}),
			headers: {
				'content-type': 'application/json',
			},
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			invitation: {
				id: 'inv_1',
				email: 'casey@example.test',
			},
			membership: {
				id: 'membership-1',
				profileId: 'profile-existing',
				status: 'invited',
			},
		});
		expect(dbMock.assertOrganizationProfileCanBeInvited).toHaveBeenCalledWith(expect.anything(), {
			organizationId: 'org-1',
			profileId: 'profile-existing',
			email: 'casey@example.test',
		});
		expect(auth.sendOrganizationInvitation).toHaveBeenCalledWith({
			email: 'casey@example.test',
			workosOrganizationId: 'workos_org_1',
			inviterWorkosUserId: 'workos_user_operator',
		});
		expect(dbMock.stageOrganizationInvitation).toHaveBeenCalledWith(expect.anything(), {
			organizationId: 'org-1',
			profileId: 'profile-existing',
			email: 'casey@example.test',
			displayName: null,
			role: 'manager',
			workosInvitationId: null,
		});
		expect(dbMock.stampOrganizationInvitation).toHaveBeenCalledWith(expect.anything(), {
			id: 'membership-1',
			organizationId: 'org-1',
			workosInvitationId: 'inv_1',
		});
	});

	// #202: the row is written first, so a WorkOS refusal can never leave somebody
	// holding a link to an agency with no row for them.
	it('writes the Membership before WorkOS is called', async () => {
		const calls: string[] = [];
		dbMock.stageOrganizationInvitation.mockImplementation(async () => {
			calls.push('stage');
			return invitedMembership;
		});
		const auth = createFakeInvitationAuth();
		auth.sendOrganizationInvitation = vi.fn(async () => {
			calls.push('workos');
			return sentInvitation;
		});
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'manager' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(201);
		expect(calls).toEqual(['stage', 'workos']);
	});

	it('sends nothing when staging refuses', async () => {
		dbMock.stageOrganizationInvitation.mockRejectedValue(
			new dbMock.StageOrganizationInvitationError('already_a_member'),
		);
		const auth = createFakeInvitationAuth();
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'manager' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: 'already_a_member' });
		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
	});

	it('rejects invalid profileId before sending a WorkOS invitation', async () => {
		const auth = createFakeInvitationAuth();
		dbMock.assertOrganizationProfileCanBeInvited.mockRejectedValue(
			new dbMock.StageOrganizationInvitationError('profile_already_linked'),
		);
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({
				email: 'casey@example.test',
				role: 'manager',
				profileId: 'profile-existing',
			}),
			headers: {
				'content-type': 'application/json',
			},
		});

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: 'profile_already_linked' });
		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
		expect(dbMock.stageOrganizationInvitation).not.toHaveBeenCalled();
	});

	it('stages the role without an invitation when the email already reaches the organization', async () => {
		const auth = createFakeInvitationAuth({
			workosUserId: 'workos_user_casey',
			status: 'active',
		});
		dbMock.stageOrganizationInvitation.mockResolvedValue({
			...invitedMembership,
			role: 'admin',
			workosInvitationId: null,
		});
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'admin' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			invitation: null,
			membership: { id: 'membership-1', workosInvitationId: null },
		});
		expect(auth.findOrganizationMember).toHaveBeenCalledWith({
			email: 'casey@example.test',
			workosOrganizationId: 'workos_org_1',
		});
		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
		expect(dbMock.stageOrganizationInvitation).toHaveBeenCalledWith(expect.anything(), {
			organizationId: 'org-1',
			email: 'casey@example.test',
			displayName: null,
			role: 'admin',
			workosInvitationId: null,
		});
	});

	it('still invites an email whose WorkOS membership is not active', async () => {
		const auth = createFakeInvitationAuth({
			workosUserId: 'workos_user_casey',
			status: 'inactive',
		});
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'manager' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(201);
		expect(auth.sendOrganizationInvitation).toHaveBeenCalledOnce();
	});

	// #220: the answer names the refusal this server decided on. WorkOS's own
	// sentence is not in it, and neither is the address it mentions.
	it('names the cause when WorkOS refuses the invitation', async () => {
		const auth = createFakeInvitationAuth();
		auth.sendOrganizationInvitation = vi.fn(async () => {
			throw Object.assign(new Error('User is already a member of the organization.'), {
				status: 422,
			});
		});
		const app = createInvitationApp(auth);

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'manager' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(502);
		await expect(response.json()).resolves.toEqual({
			error: 'invitation_refused',
			reason:
				'That address cannot be invited. Check whether they already have access or an invitation.',
		});
		// The Membership stays, with no invitation id on it. That is the failure
		// #202 chose: an operator can invite again, where the other order left a
		// live link to an agency with no row for it.
		expect(dbMock.stageOrganizationInvitation).toHaveBeenCalledOnce();
		expect(dbMock.stampOrganizationInvitation).not.toHaveBeenCalled();
	});

	// #207: the mail is already out by the time the stamp runs, so the id it
	// writes is the only record of an invitation somebody may need to revoke. One
	// retry covers the connection blip.
	it('retries a stamp that failed once', async () => {
		dbMock.stampOrganizationInvitation.mockRejectedValueOnce(new Error('connection terminated'));
		const app = createInvitationApp(createFakeInvitationAuth());

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'manager' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(201);
		expect(dbMock.stampOrganizationInvitation).toHaveBeenCalledTimes(2);
		await expect(response.json()).resolves.toMatchObject({
			membership: { workosInvitationId: 'inv_1' },
		});
	});

	// Two attempts and no more, so a persistent failure does not hold the request
	// open. The mail is out and the row exists, so the invitation did happen and
	// the 201 says so; the log line is where the id survives.
	it('answers 201 with the unstamped Membership and logs the invitation id', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		dbMock.stampOrganizationInvitation.mockRejectedValue(new Error('connection terminated'));
		const app = createInvitationApp(createFakeInvitationAuth());

		const response = await app.request('/admin/organizations/org-1/invitations', {
			method: 'POST',
			body: JSON.stringify({ email: 'casey@example.test', role: 'manager' }),
			headers: { 'content-type': 'application/json' },
		});

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toMatchObject({
			invitation: { id: 'inv_1' },
			membership: { id: 'membership-1', status: 'invited', workosInvitationId: null },
		});
		expect(dbMock.stampOrganizationInvitation).toHaveBeenCalledTimes(2);
		const line = String(logged.mock.calls[0]?.[0]);
		expect(line).toContain('inv_1');
		expect(line).toContain('membership-1');
		expect(line).toContain('org-1');

		logged.mockRestore();
	});
});

function createInvitationApp(auth: AdminInvitationAuth) {
	const app = new Hono<{ Variables: AuthVariables }>();
	app.use(
		'/admin/*',
		createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('operatorContext', operatorContext);
			await next();
		}),
	);
	registerAdminInvitationRoutes(app, {
		db: {} as never,
		auth,
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
	});

	return app;
}

function createFakeInvitationAuth(
	existingMember: Awaited<ReturnType<AdminInvitationAuth['findOrganizationMember']>> = null,
): AdminInvitationAuth {
	return {
		findOrganizationMember: vi.fn(async () => existingMember),
		sendOrganizationInvitation: vi.fn(async (input) => ({
			id: 'inv_1',
			email: input.email,
			state: 'pending' as const,
			organizationId: input.workosOrganizationId,
			acceptedUserId: null,
			expiresAt: '2026-05-17T00:00:00.000Z',
			createdAt: '2026-05-16T00:00:00.000Z',
			updatedAt: '2026-05-16T00:00:00.000Z',
		})),
	};
}

const operatorContext: OperatorAuthContext = {
	workosUser: operatorUser,
	workosOrganizationId: null,
	workosSessionId: 'session-1',
	workosRole: null,
	localIdentity: null,
};
