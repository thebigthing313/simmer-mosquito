import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerServiceRequestNearbyRoutes } from '../../service-request-nearby.js';

// The route's own decisions, which need no database: which families reach the
// reader, what the reader is asked, where the window ends, and what is refused
// before anything is asked. The reader's answer is `packages/db`'s and is
// covered by its integration suite.

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const requestId = 'c2a0e1d4-6b3f-4e8a-9d17-5f0b2c8a4e61';
const timeZone = 'America/New_York';

const authContext = { organization: { id: organizationId } } as AuthContext;

type Readers = NonNullable<Parameters<typeof registerServiceRequestNearbyRoutes>[1]['readers']>;

/**
 * An app whose three reads are fakes; the reader records what it was asked.
 *
 * The request is open unless a case closes it, and the clock is pinned to
 * 01:30Z on 20 August, the evening of the 19th in New York and inside the
 * default window, so a case that says nothing about the end gets the setting's.
 */
function createApp(overrides: Partial<Readers> = {}, closedDate: string | null = null) {
	const calls: unknown[] = [];
	const readers: Readers = {
		getServiceRequestCenter: async () => ({
			lat: 35.5,
			lng: -90.5,
			requestDate: '2026-08-15',
			closedDate,
		}),
		getOrganizationSettings: async () => ({ timezone: timeZone }),
		listNearbyRecords: async (_db, input) => {
			calls.push(input);
			return [];
		},
		...overrides,
	};
	const app = new Hono<{ Variables: AuthVariables }>();
	registerServiceRequestNearbyRoutes(app, {
		db: {} as Parameters<typeof registerServiceRequestNearbyRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', authContext);
			await next();
		}),
		readers,
		now: () => new Date('2026-08-20T01:30:00.000Z'),
	});
	return { app, calls };
}

const path = `/map/service-requests/${requestId}/nearby`;

// The end of the window is the later of the setting's `daysAfter` and the
// request's end anchor, the close day or today, each a day in the
// Organization's zone (#1084).
describe('service request nearby window end', () => {
	it('ends on the setting when the request closed inside it', async () => {
		const { app, calls } = createApp({}, '2026-08-20');

		const response = await app.request(path);

		await expect(response.json()).resolves.toMatchObject({
			dateFrom: '2026-08-01',
			dateTo: '2026-08-29',
			dateToFrom: 'setting',
		});
		expect(calls).toEqual([expect.objectContaining({ dateTo: '2026-08-29' })]);
	});

	it('ends on the close day when the request closed after the setting', async () => {
		const { app, calls } = createApp({}, '2026-10-02');

		const response = await app.request(path);

		await expect(response.json()).resolves.toMatchObject({
			dateFrom: '2026-08-01',
			dateTo: '2026-10-02',
			dateToFrom: 'close',
		});
		expect(calls).toEqual([expect.objectContaining({ dateTo: '2026-10-02' })]);
	});

	it("ends on the Organization's today while an old request is open", async () => {
		const { app, calls } = createApp({
			getServiceRequestCenter: async () => ({
				lat: 35.5,
				lng: -90.5,
				requestDate: '2026-07-01',
				closedDate: null,
			}),
		});

		const response = await app.request(path);

		// 01:30Z on 20 August is the evening of the 19th in New York.
		await expect(response.json()).resolves.toMatchObject({
			dateFrom: '2026-06-17',
			dateTo: '2026-08-19',
			dateToFrom: 'today',
		});
		expect(calls).toEqual([expect.objectContaining({ dateTo: '2026-08-19' })]);
	});

	it("reads the close day in the Organization's zone", async () => {
		const getServiceRequestCenter = vi.fn(async () => ({
			lat: 35.5,
			lng: -90.5,
			requestDate: '2026-08-15',
			closedDate: null,
		}));
		const { app } = createApp({ getServiceRequestCenter });

		await app.request(path);

		expect(getServiceRequestCenter).toHaveBeenCalledWith(expect.anything(), {
			organizationId,
			id: requestId,
			timeZone,
		});
	});

	it('lets an explicit dateTo override the computed end', async () => {
		const { app, calls } = createApp({}, '2026-10-02');

		const response = await app.request(`${path}?dateTo=2026-08-01`);

		// The caller's end is nobody's anchor, so the page does not name one.
		await expect(response.json()).resolves.toMatchObject({
			dateTo: '2026-08-01',
			dateToFrom: 'query',
		});
		expect(calls).toEqual([expect.objectContaining({ dateTo: '2026-08-01' })]);
	});
});

describe('service request nearby', () => {
	it('reads the three operational families when none are named', async () => {
		const { app, calls } = createApp();

		const response = await app.request(path);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			request: { id: requestId, lat: 35.5, lng: -90.5, requestDate: '2026-08-15' },
			families: ['larval', 'adult', 'control'],
			// Fourteen days either side of the request date, the default window.
			dateFrom: '2026-08-01',
			dateTo: '2026-08-29',
			items: [],
		});
		// The request reaches the reader by id as well as by point, which is what
		// keeps it out of its own result; the organization comes from the session.
		expect(calls).toEqual([
			expect.objectContaining({
				organizationId,
				request: { id: requestId, lat: 35.5, lng: -90.5 },
				families: ['larval', 'adult', 'control'],
				dateFrom: '2026-08-01',
				dateTo: '2026-08-29',
				timeZone: 'America/New_York',
			}),
		]);
	});

	it('reads only the families named, comma-separated or repeated', async () => {
		const { app, calls } = createApp();

		const first = await app.request(`${path}?families=publicEngagement`);
		const second = await app.request(`${path}?families=larval,publicEngagement`);
		const third = await app.request(`${path}?families=adult&families=control`);

		expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
		expect(calls.map((call) => (call as { families: unknown }).families)).toEqual([
			['publicEngagement'],
			['larval', 'publicEngagement'],
			['adult', 'control'],
		]);
		await expect(first.json()).resolves.toMatchObject({ families: ['publicEngagement'] });
	});

	it('refuses a family outside the vocabulary before reading anything', async () => {
		const { app, calls } = createApp();

		const response = await app.request(`${path}?families=infrastructure`);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'invalid_query',
			reason: 'families must be one of: larval, adult, control, publicEngagement.',
		});
		expect(calls).toEqual([]);
	});

	// A caller that wrote the key meant to name something; an empty list read as
	// "nothing" would answer an empty map with no error to say why.
	it('refuses an empty families param', async () => {
		const { app, calls } = createApp();

		const response = await app.request(`${path}?families=`);

		expect(response.status).toBe(400);
		expect(calls).toEqual([]);
	});

	it('answers the reader’s rows as they are', async () => {
		const row = {
			category: 'serviceRequest',
			family: 'publicEngagement',
			id: '0f2e6b1c-3a4d-4e5f-8a9b-1c2d3e4f5a6b',
			lat: 35.5003,
			lng: -90.5,
			date: '2026-08-20',
			occurredAt: null,
			label: 'Request 42',
			placeName: '100 Main St',
			refId: null,
			methodRefId: null,
			amount: null,
			unitId: null,
			detail: 'open',
			stages: null,
			context: null,
			hasBycatch: null,
			tagIds: null,
			distanceMeters: 33.4,
		} as const;
		const { app } = createApp({ listNearbyRecords: async () => [row] });

		const response = await app.request(`${path}?families=publicEngagement`);

		await expect(response.json()).resolves.toMatchObject({ items: [row] });
	});

	it('refuses a request id that is not a UUID', async () => {
		const getServiceRequestCenter = vi.fn();
		const { app } = createApp({ getServiceRequestCenter });

		const response = await app.request('/map/service-requests/not-a-uuid/nearby');

		expect(response.status).toBe(400);
		expect(getServiceRequestCenter).not.toHaveBeenCalled();
	});

	it('answers 404 for a request the organization does not own', async () => {
		const { app, calls } = createApp({ getServiceRequestCenter: async () => undefined });

		const response = await app.request(path);

		expect(response.status).toBe(404);
		expect(calls).toEqual([]);
	});
});
