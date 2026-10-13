import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import { registerAddressLinkedRecordRoutes } from '../../address-linked-records.js';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';

// The route's own decisions, which need no database: the Address is checked
// against the session's Organization before anything is read, and the reader is
// asked in that Organization and its zone. The reader's answer is
// `packages/db`'s and is covered by its integration suite.

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const addressId = '5b6f0a52-1f0e-4d38-9c51-2e7b0c3f9a10';

const authContext = { organization: { id: organizationId } } as AuthContext;

type Readers = NonNullable<Parameters<typeof registerAddressLinkedRecordRoutes>[1]['readers']>;

function createApp(overrides: Partial<Readers> = {}) {
	const calls: unknown[] = [];
	const readers: Readers = {
		addressExistsInOrganization: async () => true,
		getOrganizationSettings: async () => ({ timezone: 'America/Chicago' }),
		listAddressLinkedRecords: async (_db, input) => {
			calls.push(input);
			return { families: [], limit: 25 };
		},
		...overrides,
	};
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAddressLinkedRecordRoutes(app, {
		db: {} as Parameters<typeof registerAddressLinkedRecordRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', authContext);
			await next();
		}),
		readers,
	});
	return { app, calls };
}

describe('address linked records route', () => {
	it("reads in the session's Organization and its zone", async () => {
		const { app, calls } = createApp();

		const response = await app.request(`/records/address/${addressId}/linked-records`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ addressId, families: [], limit: 25 });
		expect(calls).toEqual([{ organizationId, addressId, timeZone: 'America/Chicago' }]);
	});

	it('answers 404 for an address outside the Organization, and reads nothing', async () => {
		const asked: unknown[] = [];
		const { app, calls } = createApp({
			addressExistsInOrganization: async (_db, input) => {
				asked.push(input);
				return false;
			},
		});

		const response = await app.request(`/records/address/${addressId}/linked-records`);

		expect(response.status).toBe(404);
		expect(asked).toEqual([{ organizationId, addressId }]);
		expect(calls).toEqual([]);
	});

	it('refuses an id that is not a UUID before asking the database', async () => {
		const { app, calls } = createApp({
			addressExistsInOrganization: async () => {
				throw new Error('should not be asked');
			},
		});

		const response = await app.request('/records/address/not-a-uuid/linked-records');

		expect(response.status).toBe(400);
		expect(calls).toEqual([]);
	});
});
