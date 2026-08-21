import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerProfileCommandRoutes } from '../../profile-commands.js';

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
		deactivateOrganizationMembershipWithTxid: vi.fn(),
		listOrganizationMemberships: vi.fn(),
		readMembershipRemovalTarget: vi.fn(),
		stageOrganizationInvitation: vi.fn(),
		stampOrganizationInvitation: vi.fn(),
		updateOrganizationMembershipRoleWithTxid: vi.fn(),
		validateMembershipRemoval: vi.fn(),
	};
});

vi.mock('@simmer-mosquito/db', () => dbMock);

const stagedMembership = {
	id: 'membership-1',
	organizationId: 'org-1',
	userId: null,
	profileId: 'profile-1',
	role: 'manager',
	status: 'invited',
	isDefault: false,
	invitedEmail: 'casey@example.test',
	workosInvitationId: null,
	profile: { displayName: 'Casey Field', email: 'casey@example.test', isActive: true },
	createdAt: new Date('2026-08-01T00:00:00.000Z'),
	updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

const stampedMembership = { ...stagedMembership, workosInvitationId: 'inv_1' };

// The order these two land in is the whole point of the route. WorkOS mails a
// link the moment it is called, so anything that can refuse the invitation has
// to have already run, and the row it will be accepted into has to exist.
describe('POST /organization/invitations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbMock.stageOrganizationInvitation.mockResolvedValue(stagedMembership);
		dbMock.stampOrganizationInvitation.mockResolvedValue(stampedMembership);
	});

	it('writes the Membership before WorkOS is called', async () => {
		const calls: string[] = [];
		dbMock.stageOrganizationInvitation.mockImplementation(async () => {
			calls.push('stage');
			return stagedMembership;
		});
		const auth = fakeAuth(async () => {
			calls.push('workos');
			return { id: 'inv_1', email: 'casey@example.test' };
		});

		const response = await invite(auth, { email: 'casey@example.test', role: 'manager' });

		expect(response.status).toBe(201);
		expect(calls).toEqual(['stage', 'workos']);
	});

	it('stages with no invitation id, then stamps the one WorkOS returned', async () => {
		const auth = fakeAuth();

		await invite(auth, { email: 'casey@example.test', role: 'manager' });

		expect(dbMock.stageOrganizationInvitation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ workosInvitationId: null }),
		);
		expect(dbMock.stampOrganizationInvitation).toHaveBeenCalledWith(expect.anything(), {
			id: 'membership-1',
			organizationId: 'org-1',
			workosInvitationId: 'inv_1',
		});
	});

	// The bug this route had: staging refused after the mail had gone out, so the
	// caller read 409 while the invitee held a working link to an agency with no
	// row for them.
	it('sends nothing when staging refuses', async () => {
		dbMock.stageOrganizationInvitation.mockRejectedValue(
			new dbMock.StageOrganizationInvitationError('invited_email_already_used'),
		);
		const auth = fakeAuth();

		const response = await invite(auth, { email: 'casey@example.test', role: 'manager' });

		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({
			error: 'invited_email_already_used',
		});
		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
	});

	// The failure that is left, and the safe one. The Membership stays, reading
	// as somebody invited who never got a link, and inviting again repairs it.
	it('answers 502 and keeps the Membership when WorkOS refuses', async () => {
		const auth = fakeAuth(async () => {
			throw new Error('WorkOS is down');
		});

		const response = await invite(auth, { email: 'casey@example.test', role: 'manager' });

		expect(response.status).toBe(502);
		await expect(response.json()).resolves.toMatchObject({ error: 'invitation_send_failed' });
		expect(dbMock.stageOrganizationInvitation).toHaveBeenCalledOnce();
		expect(dbMock.stampOrganizationInvitation).not.toHaveBeenCalled();
	});

	it('checks a named Profile before writing anything', async () => {
		dbMock.assertOrganizationProfileCanBeInvited.mockRejectedValue(
			new dbMock.StageOrganizationInvitationError('profile_not_found'),
		);
		const auth = fakeAuth();

		const response = await invite(auth, {
			email: 'casey@example.test',
			role: 'manager',
			profileId: 'profile-gone',
		});

		expect(response.status).toBe(404);
		expect(dbMock.stageOrganizationInvitation).not.toHaveBeenCalled();
		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
	});

	// #207: the mail is already out by the time the stamp runs, so the id it
	// writes is the only record of an invitation somebody may need to revoke. One
	// retry covers the connection blip.
	it('retries a stamp that failed once', async () => {
		dbMock.stampOrganizationInvitation.mockRejectedValueOnce(new Error('connection terminated'));

		const response = await invite(fakeAuth(), { email: 'casey@example.test', role: 'manager' });

		expect(response.status).toBe(201);
		expect(dbMock.stampOrganizationInvitation).toHaveBeenCalledTimes(2);
		await expect(response.json()).resolves.toMatchObject({
			membership: { workosInvitationId: 'inv_1' },
		});
	});

	// Two attempts and no more, so a persistent failure does not hold the request
	// open. The log line is where the id survives.
	it('answers 500 and logs the invitation id when the stamp fails twice', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		dbMock.stampOrganizationInvitation.mockRejectedValue(new Error('connection terminated'));

		const response = await invite(fakeAuth(), { email: 'casey@example.test', role: 'manager' });

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: 'invitation_stamp_failed' });
		expect(dbMock.stampOrganizationInvitation).toHaveBeenCalledTimes(2);
		const line = String(logged.mock.calls[0]?.[0]);
		expect(line).toContain('inv_1');
		expect(line).toContain('membership-1');
		expect(line).toContain('org-1');

		logged.mockRestore();
	});
});

function fakeAuth(
	send: () => Promise<{ id: string; email: string }> = async () => ({
		id: 'inv_1',
		email: 'casey@example.test',
	}),
) {
	return {
		sendOrganizationInvitation: vi.fn(send),
		deactivateOrganizationMembership: vi.fn(),
	};
}

async function invite(auth: unknown, body: unknown): Promise<Response> {
	const app = new Hono<{ Variables: AuthVariables }>();
	const authContextMiddleware = createMiddleware<{ Variables: AuthVariables }>(
		async (context, next) => {
			context.set('authContext', authContext());
			await next();
		},
	);

	registerProfileCommandRoutes(app, {
		db: {} as never,
		auth: auth as never,
		authContextMiddleware,
	});

	return app.request('/organization/invitations', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

function authContext(): AuthContext {
	return {
		organization: { id: 'org-1', workosOrganizationId: 'workos_org_1' },
		profile: { id: 'profile-actor' },
		membership: { id: 'membership-actor' },
		workosUser: { workosUserId: 'workos_user_actor' },
		role: 'owner',
	} as AuthContext;
}
