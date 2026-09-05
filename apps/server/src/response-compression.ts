/**
 * Compression for the reads that carry the map.
 *
 * Nothing in the stack added it. `apps/server` registered no compression
 * middleware, `Caddyfile.local` has no `encode`, and Railway's edge forwards a
 * body rather than transforming it, so the deployed API sent the same raw bytes
 * as a dev server. Measured against the Middlesex County staging data (14,245
 * active Habitats): the four z9 tiles that frame the organization are 1,177 KB
 * and gzip to 500 KB, and one 50-row page of `/map/habitats` is 32 KB and gzips
 * to 5 KB. The list read wins the ratio, 6.4x, because it is prose-shaped, all
 * repeated camelCase keys and uuids; the tiles win the byte count. Both fire on
 * every pan and zoom, across eleven layers.
 *
 * Why this is not `compress()` from `hono/compress`. Three reasons, and the
 * first is the whole point of the issue:
 *
 * - Its compressible-type list has no `application/vnd.mapbox-vector-tile`, so
 *   it would have declined every tile and taken only the smaller half of the
 *   saving, with nothing in the response to say it had. MVT is protobuf, which
 *   reads as "already binary, leave it"; it is delta-encoded but not
 *   entropy-coded, and it still gives back 2.4x.
 * - It sets no `vary` at all, and it rewrites an `ETag` to weak rather than
 *   leaving the response alone. This surface must not grow either an `ETag` or
 *   a shared-cache story: read `cache-headers.ts` for why a tile URL that
 *   carries no organization id cannot be allowed to key a cache entry.
 * - Its small-response threshold reads `content-length`, and nothing in this
 *   stack sets that header on a `Response`. `@hono/node-server` computes the
 *   length when it writes the socket, well after any middleware has run, so a
 *   header-only threshold never fires once and every empty tile gets a gzip
 *   header wrapped around thirty bytes. `readAtLeast` below measures the body
 *   instead.
 *
 * `vary: accept-encoding` is the one header this adds, appended to whatever the
 * organization-scope middleware already set rather than replacing it. Dropping
 * the `cookie` half would undo `cache-headers.ts` from a file that never
 * mentions it.
 */

import type { MiddlewareHandler } from 'hono';

/**
 * Prefixes whose responses are compressed.
 *
 * Every private read prefix, plus `/sync/*`, which `PRIVATE_READ_PREFIXES`
 * deliberately excludes for a different reason: the Electric proxy replaces
 * upstream headers rather than adding to nothing, so it forces its own
 * `cache-control` and `vary` inside the handler. `/sync/*` is here on its own
 * merits. Shape logs are the largest reads the server sends, they are JSON, and
 * the proxy already strips upstream `content-encoding` because `fetch` decoded
 * the body, so a shape response reaches the client raw today. A long poll that
 * answers 204 has no body and is left untouched.
 *
 * Write endpoints are absent: a request body is not a response, and these are
 * POSTs whose answers are an id and a status.
 */
export const COMPRESSED_READ_PREFIXES = ['/map/*', '/records/*', '/search', '/sync/*'] as const;

/**
 * Below this, the gzip header and trailer cost more than the saving, and the
 * CPU is spent for nothing. Hono's own default, for the same reason.
 */
const compressionThresholdBytes = 1024;

/** Preference order. `CompressionStream` offers no brotli. */
const supportedEncodings = ['gzip', 'deflate'] as const;
type SupportedEncoding = (typeof supportedEncodings)[number];

/**
 * What this server sends and what is worth compressing: text, JSON and the
 * `+json` family, XML, and the vector tiles. `text/event-stream` is excluded
 * because this middleware waits for the first kilobyte before it answers, which
 * is the one thing an event stream must not have done to it.
 */
const compressibleContentType =
	/^\s*(?:text\/(?!event-stream(?:[;\s]|$))[^;\s]+|application\/(?:json|xml|vnd\.mapbox-vector-tile)|[^;\s]+?\+(?:json|xml))(?:[;\s]|$)/i;

const noTransform = /(?:^|,)\s*no-transform\s*(?:,|$)/i;

export const compressReads: MiddlewareHandler = async (context, next) => {
	await next();

	if (!compressibleContentType.test(context.res.headers.get('content-type') ?? '')) {
		return;
	}

	// Said whether or not this response was compressed: the body a cache holds
	// depends on the request's `accept-encoding` either way.
	appendVary(context.res.headers, 'accept-encoding');

	const encoding = selectEncoding(context.req.header('accept-encoding'));
	if (encoding === null || !mayTransform(context)) {
		return;
	}

	// The chunk type Node's `CompressionStream` accepts. A `Response` body is
	// declared over the wider `ArrayBufferLike`, which admits a
	// `SharedArrayBuffer` this server never produces one of.
	const body = context.res.body as ReadableStream<NodeJS.NonSharedUint8Array> | null;
	if (body === null) {
		return;
	}

	const measured = await readAtLeast(body, compressionThresholdBytes);
	if (measured.kind === 'whole') {
		// Small enough that gzip would add bytes. It is already in hand, so hand it
		// straight back rather than re-piping a stream nobody will read twice.
		context.res = new Response(measured.bytes, context.res);
		return;
	}

	context.res = new Response(
		measured.body.pipeThrough(new CompressionStream(encoding)),
		context.res,
	);
	// After the assignment, not before it. Hono's `res` setter copies every
	// header off the response being replaced onto the replacement, so a
	// `content-length` deleted from the new response comes straight back, and it
	// would be the length of the body before it was compressed.
	context.res.headers.delete('content-length');
	context.res.headers.set('content-encoding', encoding);
};

function mayTransform(context: Parameters<MiddlewareHandler>[0]): boolean {
	const headers = context.res.headers;

	if (headers.has('content-encoding') || headers.has('transfer-encoding')) {
		return false;
	}

	if (context.req.method === 'HEAD') {
		return false;
	}

	return !noTransform.test(headers.get('cache-control') ?? '');
}

/** A body small enough to answer with, or one still coming. */
type MeasuredBody =
	| { readonly kind: 'whole'; readonly bytes: NodeJS.NonSharedUint8Array }
	| { readonly kind: 'stream'; readonly body: ReadableStream<NodeJS.NonSharedUint8Array> };

/**
 * Read up to `threshold` bytes to find out whether the body is worth
 * compressing, then give back a stream that starts where it started.
 *
 * A tile route hands over bytes that are already in memory and a shape response
 * arrives in one piece, so in practice this reads once and stops. It holds at
 * most a kilobyte, and it never waits on a body that has already ended, so a
 * long poll is delayed by nothing: the request hangs upstream, and by the time
 * there are headers to forward there are bytes behind them.
 */
async function readAtLeast(
	body: ReadableStream<NodeJS.NonSharedUint8Array>,
	threshold: number,
): Promise<MeasuredBody> {
	const reader = body.getReader();
	const chunks: NodeJS.NonSharedUint8Array[] = [];
	let total = 0;

	while (total < threshold) {
		const { done, value } = await reader.read();
		if (done) {
			return { kind: 'whole', bytes: concat(chunks, total) };
		}

		chunks.push(value);
		total += value.byteLength;
	}

	return { kind: 'stream', body: streamOf(chunks, reader) };
}

/** What was read, then the rest of what the reader still holds. */
function streamOf(
	buffered: readonly NodeJS.NonSharedUint8Array[],
	reader: ReadableStreamDefaultReader<NodeJS.NonSharedUint8Array>,
): ReadableStream<NodeJS.NonSharedUint8Array> {
	return new ReadableStream<NodeJS.NonSharedUint8Array>({
		start(controller) {
			for (const chunk of buffered) {
				controller.enqueue(chunk);
			}
		},
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				return;
			}

			controller.enqueue(value);
		},
		cancel(reason: unknown) {
			return reader.cancel(reason);
		},
	});
}

function concat(
	chunks: readonly NodeJS.NonSharedUint8Array[],
	total: number,
): NodeJS.NonSharedUint8Array {
	const joined = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return joined;
}

/**
 * The best encoding the client will take, honouring `q=0`, which is how a
 * client says "not this one" rather than leaving it out.
 */
function selectEncoding(header: string | undefined): SupportedEncoding | null {
	const weights = encodingWeights(header);

	for (const candidate of supportedEncodings) {
		const weight = weights.get(candidate) ?? weights.get('*');
		// `Number('')` is 0 and a malformed weight is NaN; both fail this.
		if (weight !== undefined && weight > 0) {
			return candidate;
		}
	}

	return null;
}

function encodingWeights(header: string | undefined): Map<string, number> {
	const weights = new Map<string, number>();

	for (const part of header?.split(',') ?? []) {
		const [name, ...parameters] = part.split(';');
		const token = name?.trim().toLowerCase() ?? '';
		if (token !== '') {
			weights.set(token, qualityOf(parameters));
		}
	}

	return weights;
}

function qualityOf(parameters: readonly string[]): number {
	const quality = parameters
		.map((parameter) => parameter.trim().toLowerCase())
		.find((parameter) => parameter.startsWith('q='));

	return quality === undefined ? 1 : Number(quality.slice(2));
}

function appendVary(headers: Headers, field: string): void {
	const existing = headers.get('vary');
	if (existing === null || existing.trim() === '') {
		headers.set('vary', field);
		return;
	}

	const present = existing
		.split(',')
		.map((entry) => entry.trim().toLowerCase())
		.includes(field);
	if (!present) {
		headers.set('vary', `${existing}, ${field}`);
	}
}
