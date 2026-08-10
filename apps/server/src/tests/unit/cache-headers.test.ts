import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { PRIVATE_READ_PREFIXES, privateNoStore } from '../../cache-headers.js';

/**
 * Beside `sync-shapes.test.ts`'s assertion on the shape proxy, and for the same
 * reason: these URLs are identical across tenants and the scope is read out of
 * the session inside the handler, so a response any shared cache may store is a
 * tenancy leak waiting on a proxy nobody remembered was there.
 *
 * The tile route in particular sent one header — `content-type` — and nothing
 * else. No `cache-control`, no `vary`, no `ETag`.
 */
describe('private read headers', () => {
	it('forces no-store and vary on a binary tile response', async () => {
		const app = appWithPrivateReads();
		app.get('/map/tiles/habitats/:z/:x/:y', () => {
			// The real tile route answers with a bare `new Response`, not
			// `context.json`, so the middleware has to reach a response it did not
			// construct.
			return new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { 'content-type': 'application/vnd.mapbox-vector-tile' },
			});
		});

		const response = await app.request('/map/tiles/habitats/13/1310/3166.mvt');

		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBe('cookie');
		expect(response.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
	});

	it('forces them on the JSON reads too', async () => {
		const app = appWithPrivateReads();
		app.get('/map/habitats', (context) => context.json({ habitats: [], total: 0 }));
		app.get('/records/:recordType/:recordId/delete-impact', (context) =>
			context.json({ blocked: false }),
		);

		for (const path of ['/map/habitats', '/records/habitat/abc/delete-impact']) {
			const response = await app.request(path);
			expect(response.headers.get('cache-control'), path).toBe('private, no-store');
			expect(response.headers.get('vary'), path).toBe('cookie');
		}
	});

	it('leaves a refusal cacheable by nobody either', async () => {
		const app = appWithPrivateReads();
		app.get('/map/tiles/:tileset/extent', (context) =>
			context.json({ error: 'invalid_tileset' }, 400),
		);

		const response = await app.request('/map/tiles/nope/extent');

		expect(response.status).toBe(400);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	// The write prefixes are not covered, and should not be: they are POSTs and
	// PATCHes, which are not cached, and adding the middleware there would only
	// make the list longer to read.
	it('covers the read prefixes and nothing else', () => {
		expect([...PRIVATE_READ_PREFIXES]).toEqual(['/map/*', '/records/*']);
	});
});

function appWithPrivateReads(): Hono {
	const app = new Hono();
	for (const prefix of PRIVATE_READ_PREFIXES) {
		app.use(prefix, privateNoStore);
	}
	return app;
}
