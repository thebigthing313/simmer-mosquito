import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import {
	registerServiceRequestNearbyRoutes,
	type ServiceRequestNearbyReaders,
} from '../../service-request-nearby.js';

/**
 * The window `GET /map/service-requests/:id/nearby` hands the reader. The
 * readers themselves are covered against Postgres in `packages/db`; this is
 * the route around them, and what it decides is the end of the window: the
 * setting's `daysAfter` past the request date is a floor, and the close day or
 * today lifts it (#1084). Today is the Organization's day and not the
 * server's, so the clock is pinned to an instant that is one day in Tokyo and
 * the day before in New York.
 */
describe('GET /map/service-requests/:id/nearby', () => {
	it('ends the window on the setting when the request closed inside it', async () => {
		const { app, listNearbyRecords } = createApp({ closedDate: '2026-07-30' });

		const reply = await app.request(`/map/service-requests/${id}/nearby`);

		expect(reply.status).toBe(200);
		expect(await reply.json()).toMatchObject({ dateFrom: '2026-07-09', dateTo: '2026-08-06' });
		expect(listNearbyRecords).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ dateFrom: '2026-07-09', dateTo: '2026-08-06' }),
		);
	});

	it('ends the window on the close day when the request closed after the setting', async () => {
		const { app, listNearbyRecords } = createApp({ closedDate: '2026-09-04' });

		const reply = await app.request(`/map/service-requests/${id}/nearby`);

		expect(await reply.json()).toMatchObject({ dateFrom: '2026-07-09', dateTo: '2026-09-04' });
		expect(listNearbyRecords).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ dateTo: '2026-09-04' }),
		);
	});

	it("ends the window on the Organization's today while the request is open", async () => {
		const { app, listNearbyRecords } = createApp({ closedDate: null });

		const reply = await app.request(`/map/service-requests/${id}/nearby`);

		// 01:30 UTC on 17 September is the evening of the 16th in New York.
		expect(await reply.json()).toMatchObject({ dateTo: '2026-09-16' });
		expect(listNearbyRecords).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ dateTo: '2026-09-16' }),
		);
	});

	it('reads the close day in the Organization’s zone', async () => {
		const { app, getServiceRequestCenter } = createApp({ closedDate: null });

		await app.request(`/map/service-requests/${id}/nearby`);

		expect(getServiceRequestCenter).toHaveBeenCalledWith(expect.anything(), {
			organizationId,
			id,
			timeZone,
		});
	});

	it('lets an explicit dateTo override the computed end', async () => {
		const { app, listNearbyRecords } = createApp({ closedDate: null });

		const reply = await app.request(`/map/service-requests/${id}/nearby?dateTo=2026-08-01`);

		expect(await reply.json()).toMatchObject({ dateTo: '2026-08-01' });
		expect(listNearbyRecords).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ dateTo: '2026-08-01' }),
		);
	});

	it('answers 404 for a request the Organization does not own', async () => {
		const { app, listNearbyRecords } = createApp({ closedDate: null, found: false });

		const reply = await app.request(`/map/service-requests/${id}/nearby`);

		expect(reply.status).toBe(404);
		expect(listNearbyRecords).not.toHaveBeenCalled();
	});
});

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const id = '3f7a2c1e-9b4d-4e6f-8a1b-2c3d4e5f6a7b';
const timeZone = 'America/New_York';
const authContext = { organization: { id: organizationId } } as AuthContext;

function createApp(options: { readonly closedDate: string | null; readonly found?: boolean }) {
	const getServiceRequestCenter = vi.fn(async () =>
		options.found === false
			? undefined
			: { lat: 35.5, lng: -90.5, requestDate: '2026-07-23', closedDate: options.closedDate },
	);
	const listNearbyRecords = vi.fn(async () => []);
	const readers: ServiceRequestNearbyReaders = {
		// Null resolves to the defaults, whose zone is New York and whose window
		// is 14 days either side.
		getOrganizationSettingsRaw: async () => null,
		getServiceRequestCenter,
		listNearbyRecords,
	};

	const app = new Hono<{ Variables: AuthVariables }>();
	registerServiceRequestNearbyRoutes(app, {
		db: {} as Parameters<typeof registerServiceRequestNearbyRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', authContext);
			await next();
		}),
		readers,
		now: () => new Date('2026-09-17T01:30:00.000Z'),
	});
	return { app, getServiceRequestCenter, listNearbyRecords };
}
