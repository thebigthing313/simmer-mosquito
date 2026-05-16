import type { AuthUser } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AdminInvitationAuth, registerAdminInvitationRoutes } from './admin-invitations.js';
import type { AuthVariables, OperatorAuthContext } from './auth-middleware.js';

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
		});
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
			workosInvitationId: 'inv_1',
		});
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

function createFakeInvitationAuth(): AdminInvitationAuth {
	return {
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
