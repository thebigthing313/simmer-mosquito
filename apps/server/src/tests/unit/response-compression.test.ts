import { gunzipSync, inflateSync } from 'node:zlib';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { PRIVATE_READ_PREFIXES, privateNoStore } from '../../cache-headers.js';
import { COMPRESSED_READ_PREFIXES, compressReads } from '../../response-compression.js';

/**
 * The map surface left the server raw: eleven tile layers and their list reads,
 * about 1.2 MB of tiles to frame one agency where 500 KB would do (#232).
 *
 * Two of these tests are why the middleware is written here rather than being
 * `compress()` from `hono/compress`: that one's compressible-type list has no
 * entry for `application/vnd.mapbox-vector-tile`, so it would have skipped the
 * larger half of the surface without saying so, and it sets no `vary` at all,
 * so nothing would record that the body depends on `accept-encoding`.
 */
describe('read compression', () => {
	it('compresses a JSON list read and round-trips the body', async () => {
		const app = appWithReadMiddleware();
		const habitats = listBody();
		app.get('/map/habitats', (context) => context.json(habitats));

		const response = await app.request('/map/habitats', gzipRequest());

		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(response.headers.get('content-length')).toBeNull();
		const raw = Buffer.from(await response.arrayBuffer());
		expect(JSON.parse(gunzipSync(raw).toString('utf8'))).toEqual(habitats);
		expect(raw.byteLength).toBeLessThan(JSON.stringify(habitats).length);
	});

	it('compresses a vector tile, the type hono skips', async () => {
		const app = appWithReadMiddleware();
		const tile = tileBody();
		app.get('/map/tiles/habitats/:z/:x/:y', () => {
			// The real tile route answers with a bare `new Response`, the same as
			// `cache-headers.test.ts` covers, so the middleware has to reach a
			// response it did not construct.
			return new Response(tile, {
				status: 200,
				headers: { 'content-type': 'application/vnd.mapbox-vector-tile' },
			});
		});

		const response = await app.request('/map/tiles/habitats/9/155/196.mvt', gzipRequest());

		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(response.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
		const raw = Buffer.from(await response.arrayBuffer());
		expect(new Uint8Array(gunzipSync(raw))).toEqual(tile);
	});

	it('keeps the tenancy headers and adds its own to them', async () => {
		const app = appWithReadMiddleware();
		app.get('/map/habitats', (context) => context.json(listBody()));

		const response = await app.request('/map/habitats', gzipRequest());

		// `privateNoStore` sets `vary: cookie` after the handler. Compression runs
		// outside it, so it appends rather than replacing: lose the `cookie` half
		// and two operators on one byte-identical URL can share a cached response.
		expect(response.headers.get('vary')).toBe('cookie, accept-encoding');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('etag')).toBeNull();
	});

	it('says the body varies by encoding even when it sends it raw', async () => {
		const app = appWithReadMiddleware();
		app.get('/map/habitats', (context) => context.json(listBody()));

		const response = await app.request('/map/habitats');

		expect(response.headers.get('content-encoding')).toBeNull();
		expect(response.headers.get('vary')).toBe('cookie, accept-encoding');
	});

	it('falls back to deflate, and refuses an encoding weighted zero', async () => {
		const app = appWithReadMiddleware();
		const habitats = listBody();
		app.get('/map/habitats', (context) => context.json(habitats));

		const deflated = await app.request('/map/habitats', {
			headers: { 'accept-encoding': 'br, deflate' },
		});
		expect(deflated.headers.get('content-encoding')).toBe('deflate');
		const inflated = inflateSync(Buffer.from(await deflated.arrayBuffer())).toString('utf8');
		expect(JSON.parse(inflated)).toEqual(habitats);

		const refused = await app.request('/map/habitats', {
			headers: { 'accept-encoding': 'gzip;q=0, identity' },
		});
		expect(refused.headers.get('content-encoding')).toBeNull();
	});

	it('leaves a tile too small to be worth it alone', async () => {
		const app = appWithReadMiddleware();
		// A tile over empty ground is a few dozen bytes. Nothing sets
		// `content-length` on a `Response` here, so the size has to be measured off
		// the body, and the body still has to arrive whole afterwards.
		const tile = new Uint8Array(Array.from({ length: 48 }, (_value, index) => index));
		app.get('/map/tiles/habitats/:z/:x/:y', () => {
			return new Response(tile, {
				status: 200,
				headers: { 'content-type': 'application/vnd.mapbox-vector-tile' },
			});
		});

		const response = await app.request('/map/tiles/habitats/9/0/0.mvt', gzipRequest());

		expect(response.headers.get('content-encoding')).toBeNull();
		expect(response.headers.get('vary')).toBe('cookie, accept-encoding');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(tile);
	});

	it('measures a chunked body across chunks and puts every one of them back', async () => {
		const app = appWithReadMiddleware();
		// Four chunks of 400 bytes: each is under the threshold, the body is over
		// it, and the first two are already read by the time the decision is made.
		const chunks = Array.from({ length: 4 }, (_value, index) =>
			new Uint8Array(400).fill(index + 1),
		);
		app.get('/sync/shapes/habitats', () => {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					for (const chunk of chunks) {
						controller.enqueue(chunk);
					}
					controller.close();
				},
			});
			return new Response(body, {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const response = await app.request('/sync/shapes/habitats', gzipRequest());

		expect(response.headers.get('content-encoding')).toBe('gzip');
		const body = gunzipSync(Buffer.from(await response.arrayBuffer()));
		expect(new Uint8Array(body)).toEqual(concatChunks(chunks));
	});

	it('drops a content-length the handler stated', async () => {
		const app = appWithReadMiddleware();
		const tile = tileBody();
		app.get('/map/tiles/habitats/:z/:x/:y', () => {
			return new Response(tile, {
				status: 200,
				headers: {
					'content-type': 'application/vnd.mapbox-vector-tile',
					'content-length': String(tile.byteLength),
				},
			});
		});

		const response = await app.request('/map/tiles/habitats/9/155/196.mvt', gzipRequest());

		// Hono's `res` setter copies the replaced response's headers onto the
		// replacement, so a length deleted before the assignment comes back, and a
		// client told to read 4,096 bytes of a 900-byte gzip stream hangs or
		// truncates.
		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(response.headers.get('content-length')).toBeNull();
		expect(new Uint8Array(gunzipSync(Buffer.from(await response.arrayBuffer())))).toEqual(tile);
	});

	it('does not encode a response that already is', async () => {
		const app = appWithReadMiddleware();
		const body = alreadyEncodedBytes();
		app.get('/map/already', () => {
			const headers = new Headers({
				'content-type': 'application/json',
				'content-encoding': 'gzip',
			});
			return new Response(body, { status: 200, headers });
		});

		const response = await app.request('/map/already', gzipRequest());

		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
	});

	it('leaves a no-transform response and an empty one alone', async () => {
		const app = appWithReadMiddleware();
		// Not under `/map/*`: `privateNoStore` overwrites `cache-control` there, so
		// a handler cannot ask for `no-transform` on that prefix at all.
		app.get('/sync/no-transform', (context) => {
			context.header('cache-control', 'private, no-store, no-transform');
			return context.json(listBody());
		});
		app.get('/sync/shapes/habitats', () => new Response(null, { status: 204 }));

		const transformed = await app.request('/sync/no-transform', gzipRequest());
		expect(transformed.headers.get('content-encoding')).toBeNull();

		const empty = await app.request('/sync/shapes/habitats', gzipRequest());
		expect(empty.status).toBe(204);
		expect(empty.headers.get('content-encoding')).toBeNull();
	});

	it('leaves a HEAD alone', async () => {
		const app = appWithReadMiddleware();
		app.on(['GET', 'HEAD'], '/map/habitats', (context) => context.json(listBody()));

		const response = await app.request('/map/habitats', {
			method: 'HEAD',
			headers: { 'accept-encoding': 'gzip' },
		});

		expect(response.headers.get('content-encoding')).toBeNull();
	});

	it('compresses a shape response without disturbing what Electric said', async () => {
		const app = appWithReadMiddleware();
		app.get('/sync/shapes/habitats', () => {
			// What `proxyElectricShape` hands back: Electric's headers minus the
			// hop-by-hop set it blocks, with the tenancy pair forced on.
			const headers = new Headers({
				'content-type': 'application/json',
				'electric-handle': '42-1690',
				'electric-offset': '0_0',
				'access-control-expose-headers': 'electric-handle, electric-offset',
				'cache-control': 'private, no-store',
				vary: 'cookie',
			});
			return new Response(JSON.stringify(listBody()), { status: 200, headers });
		});

		const response = await app.request('/sync/shapes/habitats', gzipRequest());

		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(response.headers.get('electric-handle')).toBe('42-1690');
		expect(response.headers.get('electric-offset')).toBe('0_0');
		expect(response.headers.get('vary')).toBe('cookie, accept-encoding');
	});

	// The shape proxy is in the list and the write endpoints are not: shape logs
	// are the largest reads the server sends, and a request body is not a
	// response.
	it('covers the private read prefixes plus the shape proxy', () => {
		expect([...COMPRESSED_READ_PREFIXES]).toEqual(['/map/*', '/records/*', '/search', '/sync/*']);
		expect(COMPRESSED_READ_PREFIXES).toEqual(expect.arrayContaining([...PRIVATE_READ_PREFIXES]));
	});
});

function appWithReadMiddleware(): Hono {
	const app = new Hono();
	// The order `main.ts` registers them in: compression outermost, so it appends
	// to the `vary` the tenancy middleware sets rather than being overwritten.
	for (const prefix of COMPRESSED_READ_PREFIXES) {
		app.use(prefix, compressReads);
	}
	for (const prefix of PRIVATE_READ_PREFIXES) {
		app.use(prefix, privateNoStore);
	}
	return app;
}

function gzipRequest(): RequestInit {
	return { headers: { 'accept-encoding': 'gzip, deflate, br' } };
}

/** A page of the list read: repeated keys and uuids over 50 rows. */
function listBody(): { readonly habitats: readonly unknown[]; readonly total: number } {
	return {
		habitats: Array.from({ length: 50 }, (_value, index) => ({
			id: `0f7f1d3a-0000-4000-8000-${String(index).padStart(12, '0')}`,
			name: `Catch basin ${index}`,
			habitatTypeId: '0f7f1d3a-1111-4000-8000-000000000001',
			latitude: 42.36 + index / 1000,
			longitude: -71.06 - index / 1000,
			status: 'active',
		})),
		total: 14_245,
	};
}

function tileBody(): Uint8Array {
	return new Uint8Array(Array.from({ length: 4096 }, (_value, index) => index % 7));
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
	const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return joined;
}

function alreadyEncodedBytes(): Uint8Array {
	return new Uint8Array(Array.from({ length: 2048 }, (_value, index) => index % 11));
}
