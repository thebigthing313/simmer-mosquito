/**
 * The two writes a sign-in ends on, which `main.ts` used to hold as closures
 * nothing could reach. The finalizer's answer is the one the sign-in flows
 * branch on, so what is pinned is that it reads the upserted identity rather
 * than the session, and that the cookie is set on every finalize.
 */

import type { AuthenticatedSession } from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { createSessionWriter } from '../../../../auth/session/create-session-writer.js';

const session: AuthenticatedSession = {
	authenticated: true,
	user: {
		workosUserId: 'user_1',
		email: 'a@b.test',
		firstName: 'A',
		lastName: 'B',
		displayName: 'A B',
		emailVerified: true,
		profilePictureUrl: null,
	},
	workosOrganizationId: 'org_1',
	sessionId: 'session_1',
	role: 'member',
	sealedSession: 'sealed.value',
};

function writer(organizationId: string | null) {
	const upsertIdentity = vi.fn(async () => ({ organizationId }) as never);
	const getOrganization = vi.fn(async () => ({ workosOrganizationId: 'org_1', name: 'Delta' }));
	const created = createSessionWriter({
		db: {} as never,
		auth: { getOrganization },
		upsertIdentity,
		secure: true,
	});
	return { ...created, upsertIdentity, getOrganization };
}

async function finalizeThrough(w: ReturnType<typeof writer>) {
	const app = new Hono();
	let answer: { readonly organizationRequired: boolean } | null = null;
	app.get('/', async (context) => {
		answer = await w.finalizeSession(context as never, session);
		return context.text('ok');
	});
	const response = await app.request('/');
	return { answer, response };
}

describe('createSessionWriter', () => {
	it('upserts the WorkOS identity with the organization name and role, then sets the cookie', async () => {
		const w = writer('simmer_org_1');
		const { answer, response } = await finalizeThrough(w);

		expect(w.upsertIdentity).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				workosUserId: 'user_1',
				workosOrganizationId: 'org_1',
				workosOrganizationName: 'Delta',
				workosRole: 'member',
			}),
		);
		expect(answer).toEqual({ organizationRequired: false });
		expect(response.headers.get('set-cookie')).toContain('wos-session=sealed.value');
		expect(response.headers.get('set-cookie')).toContain('Secure');
	});

	it('reports organizationRequired off the upserted identity, not the session', async () => {
		const { answer } = await finalizeThrough(writer(null));

		expect(answer).toEqual({ organizationRequired: true });
	});
});
