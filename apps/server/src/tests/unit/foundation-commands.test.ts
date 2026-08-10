import type { SafeOrgLookup, SafeTag, SimmerRole } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerFoundationCommandRoutes } from '../../foundation-commands/index.js';

describe('registerFoundationCommandRoutes', () => {
	it('creates collection methods through agency-scoped domain commands', async () => {
		const calls: unknown[] = [];
		const app = createApp(
			{
				writeLookupCommand: async (_trx, command) => {
					calls.push(command);
					return collectionMethodRow;
				},
			},
			'admin',
		);

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

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(response.status).toBe(201);
		expect(calls).toMatchObject([
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
		]);
	});

	it('returns domain validation errors before writing invalid payloads', async () => {
		let wrote = false;
		const app = createApp({
			writeLookupCommand: async () => {
				wrote = true;
				return collectionMethodRow;
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
		const app = createApp(
			{
				writeLookupCommand: async (_trx, command) => {
					calls.push(command);
					return { ...collectionMethodRow, isActive: false };
				},
			},
			'admin',
		);

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

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(calls).toMatchObject([
			{ type: 'foundation.updateCollectionMethod' },
			{ type: 'foundation.deactivateCollectionMethod' },
		]);
	});

	it('creates collection lures through agency-scoped domain commands', async () => {
		const calls: unknown[] = [];
		const app = createApp(
			{
				writeLookupCommand: async (_trx, command) => {
					calls.push(command);
					return { ...collectionMethodRow, name: 'Dry ice' };
				},
			},
			'admin',
		);

		const response = await app.request('/foundation/collection-lures', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: 'e6d99dd0-9dcb-4dab-a47d-11e74cd46be1',
				name: 'Dry ice',
				description: 'CO2 lure',
			}),
		});

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(response.status).toBe(201);
		expect(calls).toMatchObject([
			{
				type: 'foundation.createCollectionLure',
				payload: {
					organizationId: organizationId,
					actorProfileId: profileId,
					collectionLureId: 'e6d99dd0-9dcb-4dab-a47d-11e74cd46be1',
					name: 'Dry ice',
				},
			},
		]);
	});

	it('updates habitat type details and lifecycle in one txid-returning write', async () => {
		const calls: unknown[] = [];
		const app = createApp(
			{
				writeLookupCommand: async (_trx, command) => {
					calls.push(command);
					return { ...collectionMethodRow, name: 'Catch basin', isActive: false };
				},
			},
			'admin',
		);

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

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(calls).toMatchObject([
			{ type: 'foundation.updateHabitatType' },
			{ type: 'foundation.deactivateHabitatType' },
		]);
	});

	it('creates tags through agency-scoped domain commands', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeTagCommand: async (_trx, command) => {
				calls.push(command);
				return tagRow;
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

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(response.status).toBe(201);
		expect(calls).toMatchObject([
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
		]);
	});

	it('updates tag details and lifecycle in one txid-returning write', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeTagCommand: async (_trx, command) => {
				calls.push(command);
				return { ...tagRow, isActive: false };
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

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(calls).toMatchObject([
			{ type: 'fieldWork.updateTag' },
			{ type: 'fieldWork.deactivateTag' },
		]);
	});

	it('deletes tags through the agency-scoped delete command', async () => {
		const calls: unknown[] = [];
		const app = createApp({
			writeTagCommand: async (_trx, command) => {
				calls.push(command);
				return tagRow;
			},
		});

		const response = await app.request('/foundation/tags/c15223fd-f242-4e6f-8c0e-0229ecdd95c3', {
			method: 'DELETE',
		});

		await expect(response.json()).resolves.toMatchObject({ txid: transactionId });
		expect(calls).toMatchObject([
			{
				type: 'fieldWork.deleteTag',
				payload: {
					organizationId,
					actorProfileId: profileId,
					tagId: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
				},
			},
		]);
	});

	// The tag catalog answers `fieldWork.*` commands from a foundation route, so
	// it has to consult the same permission map the `/field-work/*` routes do.
	// Nothing is written: the writers record every call they receive.
	it.each([
		['viewer', 'POST', '/foundation/tags'],
		['collector', 'POST', '/foundation/tags'],
		['collector', 'PATCH', '/foundation/tags/c15223fd-f242-4e6f-8c0e-0229ecdd95c3'],
		['collector', 'DELETE', '/foundation/tags/c15223fd-f242-4e6f-8c0e-0229ecdd95c3'],
		// "Lookup management is owner/admin only" — a manager clears the tag
		// catalog's floor and is still refused here, which is the case that would
		// have passed silently if the ladder only had one rung above viewer.
		['manager', 'POST', '/foundation/collection-methods'],
		['manager', 'POST', '/foundation/collection-lures'],
		['manager', 'POST', '/foundation/habitat-types'],
		['collector', 'POST', '/foundation/collection-methods'],
		['viewer', 'POST', '/foundation/collection-methods'],
	] as const)('refuses a %s issuing %s %s', async (role, method, path) => {
		const calls: unknown[] = [];
		const app = createApp(
			{
				writeTagCommand: async (_trx, command) => {
					calls.push(command);
					return tagRow;
				},
				writeLookupCommand: async (_trx, command) => {
					calls.push(command);
					return collectionMethodRow;
				},
			},
			role,
		);

		const response = await app.request(
			path,
			method === 'DELETE'
				? { method }
				: {
						method,
						headers: { 'content-type': 'application/json' },
						// Valid for both endpoint families: the role check sits after the
						// command is built, so a malformed body would answer 400 and prove
						// nothing about the role.
						body: JSON.stringify({
							id: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
							tagName: 'High priority',
							name: 'CDC light trap',
						}),
					},
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
		expect(calls).toEqual([]);
	});
});

function createApp(
	options: Pick<
		Parameters<typeof registerFoundationCommandRoutes>[1],
		'writeLookupCommand' | 'writeTagCommand'
	>,
	role: SimmerRole = 'manager',
) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerFoundationCommandRoutes(app, {
		db: transactionOnlyDatabase(),
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', { ...authContext, role });
			await next();
		}),
		...options,
	});
	return app;
}

/**
 * The txid every write in this file answers with. It is the transaction's now,
 * not the writer's: `runCommands` reads `pg_current_xact_id()` after the batch,
 * so a stubbed writer has nothing to return it from.
 */
const transactionId = 42;

/**
 * All these handlers ask of a database is a transaction to run their writer in,
 * and one `select pg_current_xact_id()` at the end of it.
 */
function transactionOnlyDatabase(): Parameters<typeof registerFoundationCommandRoutes>[1]['db'] {
	// `readCurrentTransactionId` goes through Kysely's raw-SQL builder, which asks
	// its argument for an executor and then compiles through it. Standing in for
	// that is three methods, and answering one row is the whole of it.
	const executor = {
		transformQuery: (node: unknown) => node,
		compileQuery: () => ({ sql: '', parameters: [] }),
		executeQuery: () => Promise.resolve({ rows: [{ txid: String(transactionId) }] }),
	};

	return {
		transaction: () => ({
			execute: async <T>(run: (trx: never) => Promise<T>): Promise<T> =>
				run({ getExecutor: () => executor } as never),
		}),
	} as unknown as Parameters<typeof registerFoundationCommandRoutes>[1]['db'];
}

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const profileId = '0105b111-e0be-46b0-b5e9-a87507889b51';

const authContext = {
	organization: { id: organizationId },
	profile: { id: profileId },
	// Tag catalog management is manager-and-above, so the happy paths below sign
	// in as one. `createApp` takes an override for the refusal cases.
	role: 'manager',
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
