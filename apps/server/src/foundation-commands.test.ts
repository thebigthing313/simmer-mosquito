import type { SafeOrgLookup, SafeTag } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { registerFoundationCommandRoutes } from './foundation-commands/index.js';

describe('registerFoundationCommandRoutes', () => {
	it('creates collection methods through agency-scoped domain commands', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeCollectionMethodCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: collectionMethodRow, txid: 42 };
			},
		});

		const response = await app.request('/foundation/collection-methods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: '4fe25a2d-925c-4d37-9d4e-07185ad19858',
				name: 'CDC light trap',
				description: 'Overnight trap',
				customSchema: null,
				actionThreshold: 12,
			}),
		});

		await expect(response.json()).resolves.toMatchObject({ txid: 42 });
		expect(response.status).toBe(201);
		expect(calls).toMatchObject([
			[
				{
					type: 'foundation.createCollectionMethod',
					payload: {
						organizationId: organizationId,
						actorProfileId: profileId,
						collectionMethodId: '4fe25a2d-925c-4d37-9d4e-07185ad19858',
						name: 'CDC light trap',
						actionThreshold: 12,
					},
				},
			],
		]);
	});

	it('returns domain validation errors before writing invalid payloads', async () => {
		let wrote = false;
		const app = createApp({
			writeCollectionMethodCommands: async () => {
				wrote = true;
				return { row: collectionMethodRow, txid: 42 };
			},
		});

		const response = await app.request('/foundation/collection-methods', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: 'not-a-uuid',
				name: 'CDC light trap',
			}),
		});

		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_command' });
		expect(response.status).toBe(400);
		expect(wrote).toBe(false);
	});

	it('updates details and lifecycle in one txid-returning write', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeCollectionMethodCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: { ...collectionMethodRow, isActive: false }, txid: 43 };
			},
		});

		const response = await app.request(
			'/foundation/collection-methods/4fe25a2d-925c-4d37-9d4e-07185ad19858',
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: 'Updated CDC light trap',
					isActive: false,
				}),
			},
		);

		await expect(response.json()).resolves.toMatchObject({ txid: 43 });
		expect(calls).toMatchObject([
			[
				{ type: 'foundation.updateCollectionMethod' },
				{ type: 'foundation.deactivateCollectionMethod' },
			],
		]);
	});

	it('creates collection lures through agency-scoped domain commands', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeCollectionMethodCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: { ...collectionMethodRow, name: 'Dry ice' }, txid: 44 };
			},
		});

		const response = await app.request('/foundation/collection-lures', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: 'e6d99dd0-9dcb-4dab-a47d-11e74cd46be1',
				name: 'Dry ice',
				description: 'CO2 lure',
			}),
		});

		await expect(response.json()).resolves.toMatchObject({ txid: 44 });
		expect(response.status).toBe(201);
		expect(calls).toMatchObject([
			[
				{
					type: 'foundation.createCollectionLure',
					payload: {
						organizationId: organizationId,
						actorProfileId: profileId,
						collectionLureId: 'e6d99dd0-9dcb-4dab-a47d-11e74cd46be1',
						name: 'Dry ice',
					},
				},
			],
		]);
	});

	it('updates habitat type details and lifecycle in one txid-returning write', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeCollectionMethodCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: { ...collectionMethodRow, name: 'Catch basin', isActive: false }, txid: 45 };
			},
		});

		const response = await app.request(
			'/foundation/habitat-types/d93dd5f9-0dac-4097-bc9d-d3b0d23333e6',
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: 'Catch basin',
					customSchema: { inspectedBy: 'dip' },
					isActive: false,
				}),
			},
		);

		await expect(response.json()).resolves.toMatchObject({ txid: 45 });
		expect(calls).toMatchObject([
			[{ type: 'foundation.updateHabitatType' }, { type: 'foundation.deactivateHabitatType' }],
		]);
	});

	it('creates tags through agency-scoped domain commands', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeTagCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: tagRow, txid: 46 };
			},
		});

		const response = await app.request('/foundation/tags', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
				tagName: 'High priority',
				description: 'Needs attention',
				color: '#dc2626',
			}),
		});

		await expect(response.json()).resolves.toMatchObject({ txid: 46 });
		expect(response.status).toBe(201);
		expect(calls).toMatchObject([
			[
				{
					type: 'fieldWork.createTag',
					payload: {
						organizationId,
						actorProfileId: profileId,
						tagId: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
						tagName: 'High priority',
						description: 'Needs attention',
						color: '#dc2626',
					},
				},
			],
		]);
	});

	it('updates tag details and lifecycle in one txid-returning write', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeTagCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: { ...tagRow, isActive: false }, txid: 47 };
			},
		});

		const response = await app.request('/foundation/tags/c15223fd-f242-4e6f-8c0e-0229ecdd95c3', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				tagName: 'High priority updated',
				color: null,
				isActive: false,
			}),
		});

		await expect(response.json()).resolves.toMatchObject({ txid: 47 });
		expect(calls).toMatchObject([
			[{ type: 'fieldWork.updateTag' }, { type: 'fieldWork.deactivateTag' }],
		]);
	});

	it('deletes tags through the agency-scoped delete command', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeTagCommands: async (_db, commands) => {
				calls.push(commands);
				return { row: tagRow, txid: 48 };
			},
		});

		const response = await app.request('/foundation/tags/c15223fd-f242-4e6f-8c0e-0229ecdd95c3', {
			method: 'DELETE',
		});

		await expect(response.json()).resolves.toMatchObject({ txid: 48 });
		expect(calls).toMatchObject([
			[
				{
					type: 'fieldWork.deleteTag',
					payload: {
						organizationId,
						actorProfileId: profileId,
						tagId: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
					},
				},
			],
		]);
	});
});

function createApp(
	options: Pick<
		Parameters<typeof registerFoundationCommandRoutes>[1],
		'writeCollectionMethodCommands' | 'writeTagCommands'
	>,
) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerFoundationCommandRoutes(app, {
		db: {} as Parameters<typeof registerFoundationCommandRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', authContext);
			await next();
		}),
		...options,
	});
	return app;
}

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const profileId = '0105b111-e0be-46b0-b5e9-a87507889b51';

const authContext = {
	organization: { id: organizationId },
	profile: { id: profileId },
} as AuthContext;

const collectionMethodRow: SafeOrgLookup = {
	id: '4fe25a2d-925c-4d37-9d4e-07185ad19858',
	organizationId,
	name: 'CDC light trap',
	description: 'Overnight trap',
	customSchema: null,
	actionThreshold: 12,
	isActive: true,
	createdByProfileId: profileId,
	updatedByProfileId: profileId,
	createdAt: new Date('2026-05-18T00:00:00.000Z'),
	updatedAt: new Date('2026-05-18T00:00:00.000Z'),
};

const tagRow: SafeTag = {
	id: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
	organizationId,
	tagName: 'High priority',
	description: 'Needs attention',
	color: '#dc2626',
	isActive: true,
	createdByProfileId: profileId,
	updatedByProfileId: profileId,
	createdAt: new Date('2026-05-18T00:00:00.000Z'),
	updatedAt: new Date('2026-05-18T00:00:00.000Z'),
};
