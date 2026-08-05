import { RecordDeleteBlockedError } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { deleteBlockedBody, registerRecordDeletionRoutes } from './record-deletion.js';

/**
 * The delete-impact endpoint and the 409 body, at the HTTP boundary.
 *
 * `record-deletion.integration.test.ts` in `packages/db` proves the policy
 * itself. These are the two things around it that a policy test cannot reach:
 * what the route does with a record type it has never heard of, and what the
 * refusal actually looks like on the wire.
 */
describe('GET /records/:recordType/:recordId/delete-impact', () => {
	it('answers 404 for a record type that has no delete policy', async () => {
		const response = await app().request(`/records/sprocket/${recordId}/delete-impact`);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({ error: 'unknown_record_type' });
	});

	it('refuses an unknown record type without opening the database', async () => {
		// The database here throws if touched, so a passing test also proves the
		// 404 comes from the registry check rather than from a lookup that found
		// nothing — a different answer, and a slower one.
		const response = await app().request(`/records/sprocket/${recordId}/delete-impact`);

		expect(response.status).toBe(404);
	});

	it('names the type it did not recognise', async () => {
		const response = await app().request(`/records/sprocket/${recordId}/delete-impact`);

		await expect(response.json()).resolves.toMatchObject({
			reason: 'sprocket cannot be deleted.',
		});
	});
});

describe('deleteBlockedBody', () => {
	it('carries the blockers the client would otherwise have to ask for', async () => {
		// The shape seven `handleCommandError` functions answer 409 with. The
		// `blockers` array is the whole reason the body is not just a message.
		const blockers = [
			{ key: 'addressTraps', count: 2, singular: 'trap', plural: 'traps' },
		] as const;
		const error = new RecordDeleteBlockedError('address', recordId, blockers);

		expect(deleteBlockedBody(error)).toEqual({
			error: 'delete_blocked',
			message: error.message,
			blockers,
		});
	});
});

const recordId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';
const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';

/**
 * The real route over a database that refuses to be used.
 *
 * Everything here is about the answer given *before* a read happens. What the
 * route does once it reaches the policy — including the deliberate
 * `found: false` for another agency's record — needs real tables and lives in
 * `record-deletion.integration.test.ts`.
 */
function app(): Hono<{ Variables: AuthVariables }> {
	const instance = new Hono<{ Variables: AuthVariables }>();
	registerRecordDeletionRoutes(instance, {
		db: unusableDb as never,
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', {
				organization: { id: organizationId },
				profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
				role: 'owner',
			} as AuthContext);
			await next();
		}),
	});
	return instance;
}

const unusableDb = {
	selectFrom: () => {
		throw new Error('The database must not be reached for an unknown record type.');
	},
};
