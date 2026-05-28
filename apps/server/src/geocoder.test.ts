import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { parseGeocoderQuery, registerGeocoderRoutes } from './geocoder.js';

describe('parseGeocoderQuery', () => {
	it('parses forward or reverse geocoder queries with bounded options', () => {
		expect(
			parseGeocoderQuery(
				new URLSearchParams({
					q: '1109 N Highland St, Arlington VA',
					country: 'usa',
					fields: 'timezone,census',
					limit: '3',
				}),
			),
		).toEqual({
			ok: true,
			query: {
				q: '1109 N Highland St, Arlington VA',
				country: 'USA',
				fields: 'timezone,census',
				limit: 3,
			},
		});
	});

	it('rejects missing q, unknown params, unsafe fields, and oversized limits', () => {
		expect(parseGeocoderQuery(new URLSearchParams())).toMatchObject({
			ok: false,
			reason: 'q is required.',
		});
		expect(
			parseGeocoderQuery(new URLSearchParams({ q: 'Jonesboro AR', api_key: 'secret' })),
		).toMatchObject({
			ok: false,
			reason: 'Unsupported geocoder query parameter: api_key.',
		});
		expect(
			parseGeocoderQuery(new URLSearchParams({ q: 'Jonesboro AR', fields: 'timezone;bad' })),
		).toMatchObject({
			ok: false,
			reason: 'fields must contain only letters, numbers, commas, dots, dashes, or underscores.',
		});
		expect(
			parseGeocoderQuery(new URLSearchParams({ q: 'Jonesboro AR', limit: '11' })),
		).toMatchObject({
			ok: false,
			reason: 'limit must be between 1 and 10.',
		});
	});
});

describe('registerGeocoderRoutes', () => {
	it('proxies authenticated geocoder searches to Geocodio without exposing the API key', async () => {
		const calls: string[] = [];
		const app = createApp({
			fetchGeocoder: async (input) => {
				calls.push(String(input));
				return Response.json({
					input: { address_components: {} },
					results: [
						{
							formatted_address: '1109 N Highland St, Arlington, VA 22201',
							location: { lat: 38.886665, lng: -77.094733 },
						},
					],
				});
			},
		});

		const response = await app.request(
			'/geocoder/search?q=1109%20N%20Highland%20St%2C%20Arlington%20VA&country=usa&limit=1',
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			provider: 'geocodio',
			query: {
				q: '1109 N Highland St, Arlington VA',
				country: 'USA',
				fields: null,
				limit: 1,
			},
			results: [
				{
					formatted_address: '1109 N Highland St, Arlington, VA 22201',
					location: { lat: 38.886665, lng: -77.094733 },
				},
			],
		});

		expect(calls).toHaveLength(1);
		const upstreamUrl = new URL(calls[0] ?? '');
		expect(upstreamUrl.origin).toBe('https://api.geocod.io');
		expect(upstreamUrl.pathname).toBe('/v1.12/geocode');
		expect(upstreamUrl.searchParams.get('q')).toBe('1109 N Highland St, Arlington VA');
		expect(upstreamUrl.searchParams.get('api_key')).toBe(apiKey);
		expect(upstreamUrl.searchParams.get('country')).toBe('USA');
	});

	it('requires auth before calling Geocodio', async () => {
		const fetchGeocoder = vi.fn();
		const app = createApp({ authenticated: false, fetchGeocoder });

		const response = await app.request('/geocoder/search?q=Jonesboro%20AR');

		await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' });
		expect(response.status).toBe(401);
		expect(fetchGeocoder).not.toHaveBeenCalled();
	});

	it('rejects invalid queries and missing configuration before calling Geocodio', async () => {
		const fetchGeocoder = vi.fn();
		const invalidQueryApp = createApp({ fetchGeocoder });

		const invalidQueryResponse = await invalidQueryApp.request('/geocoder/search?limit=1');

		await expect(invalidQueryResponse.json()).resolves.toMatchObject({ error: 'invalid_query' });
		expect(invalidQueryResponse.status).toBe(400);
		expect(fetchGeocoder).not.toHaveBeenCalled();

		const unconfiguredApp = createApp({ apiKey: null, fetchGeocoder });

		const unconfiguredResponse = await unconfiguredApp.request('/geocoder/search?q=Jonesboro%20AR');

		await expect(unconfiguredResponse.json()).resolves.toEqual({
			error: 'geocoder_not_configured',
		});
		expect(unconfiguredResponse.status).toBe(503);
		expect(fetchGeocoder).not.toHaveBeenCalled();
	});

	it('returns a service error when Geocodio fails', async () => {
		const app = createApp({
			fetchGeocoder: async () =>
				Response.json(
					{
						error: 'Invalid API key',
					},
					{ status: 403 },
				),
		});

		const response = await app.request('/geocoder/search?q=Jonesboro%20AR');

		await expect(response.json()).resolves.toEqual({
			error: 'geocoder_failed',
			status: 403,
			response: {
				error: 'Invalid API key',
			},
		});
		expect(response.status).toBe(502);
	});
});

function createApp(options: {
	readonly authenticated?: boolean;
	readonly apiKey?: string | null;
	readonly fetchGeocoder: NonNullable<
		Parameters<typeof registerGeocoderRoutes>[1]['fetchGeocoder']
	>;
}) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerGeocoderRoutes(app, {
		apiKey: options.apiKey === undefined ? apiKey : options.apiKey,
		authContextMiddleware: createMiddleware(async (context, next) => {
			if (options.authenticated === false) {
				return context.json({ error: 'unauthenticated' }, 401);
			}

			context.set('authContext', authContext);
			await next();
		}),
		fetchGeocoder: options.fetchGeocoder,
	});
	return app;
}

const apiKey = 'geocodio_test_key';

const authContext = {
	organization: { id: 'f0dbf1c7-d278-441e-82b4-9292d390ce72' },
} as AuthContext;
