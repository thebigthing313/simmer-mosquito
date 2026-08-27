import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerSearchRoutes } from '../../search.js';

/**
 * Every refusal `/search` can answer, against the real route over a database
 * that throws if it is reached.
 *
 * A passing test therefore also proves the refusal came from the parser rather
 * than from a query that found nothing — a different answer, and a slower one.
 * What the endpoint does with real documents is the reader's integration suite
 * in `packages/db`.
 */
describe('GET /search refusals', () => {
	it('refuses an empty query', async () => {
		const response = await app().request('/search?q=&limit=10');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ error: 'invalid_query' });
	});

	it('refuses a query that is only whitespace', async () => {
		const response = await app().request('/search?q=%20%20&limit=10');

		expect(response.status).toBe(400);
	});

	// Refused rather than truncated: a silently truncated query returns results
	// for a phrase the person did not type.
	it('refuses a query over 200 characters', async () => {
		const response = await app().request(`/search?q=${'a'.repeat(201)}&limit=10`);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			reason: 'A search query may be at most 200 characters.',
		});
	});

	it('takes a query of exactly 200 characters', async () => {
		const response = await app().request(`/search?q=${'a'.repeat(200)}&limit=10`);

		expect(response.status).toBe(200);
	});

	// No default. The palette cannot know its server budget until the group caps
	// are applied, so the caller states it.
	it('refuses a missing limit', async () => {
		const response = await app().request('/search?q=elm');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ reason: 'A limit is required.' });
	});

	it.each(['0', '101', '-1', 'ten', '1.5'])('refuses limit %s', async (limit) => {
		const response = await app().request(`/search?q=elm&limit=${limit}`);

		expect(response.status).toBe(400);
	});

	it.each(['-1', '1001', 'twenty', '2.5'])('refuses offset %s', async (offset) => {
		const response = await app().request(`/search?q=elm&limit=10&offset=${offset}`);

		expect(response.status).toBe(400);
	});

	it('refuses an unknown class', async () => {
		const response = await app().request('/search?q=elm&limit=10&class=habitats');

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			reason: 'Class must be records or comments.',
		});
	});

	it.each(['records', 'comments'])('takes class %s', async (documentClass) => {
		const response = await app().request(`/search?q=elm&limit=10&class=${documentClass}`);

		expect(response.status).toBe(200);
	});
});

describe('GET /search response envelope', () => {
	// `query`, `offset` and `limit` are echoed so the client can assert a response
	// matches the request it rendered under, which matters because the palette
	// deliberately shows a previous list under a live one.
	it('echoes the normalized query, the offset and the limit', async () => {
		const response = await app().request('/search?q=%20%20elm%20%20%20ditch%20&limit=7&offset=14');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			query: 'elm ditch',
			limit: 7,
			offset: 14,
		});
	});

	it('defaults the offset to zero when the caller omits it', async () => {
		const response = await app().request('/search?q=elm&limit=10');

		await expect(response.json()).resolves.toMatchObject({ offset: 0 });
	});

	it('carries a flat result list and both counts', async () => {
		const response = await app().request('/search?q=elm&limit=10');

		await expect(response.json()).resolves.toMatchObject({
			results: [],
			total: 0,
			counts: { records: 0, comments: 0 },
		});
	});
});

/**
 * Composition, over rows the reader would have returned.
 *
 * The comment case is the one that matters. `comments.entity_type` is stored
 * `snake_case` and the domain's `CommentTargetType` is `camelCase`, so handing
 * the column through untouched produces a target type the client's route map
 * has no entry for, and the five multi-word types resolve to nothing at all.
 */
describe('GET /search composition', () => {
	it('answers a comment with a camelCase target type', async () => {
		const response = await app(
			row({
				source_table: 'comments',
				fields: { comment_text: 'Sprayed the south ditch' },
				display: { entity_type: 'source_reduction', entity_id: targetId },
				matched_field: 'comment_text',
			}),
		).request('/search?q=ditch&limit=10');

		await expect(response.json()).resolves.toMatchObject({
			results: [
				{
					kind: 'comment',
					title: 'Sprayed the south ditch',
					targetType: 'sourceReduction',
					targetId,
				},
			],
		});
	});

	// Matched on the field the title came from, so the second line is the record's
	// context rather than a repeat of the title.
	it('composes a service request as its sequential number', async () => {
		const response = await app(
			row({
				source_table: 'service_requests',
				fields: { display_name: '1042', details: 'Standing water behind the school' },
				matched_field: 'display_name',
			}),
		).request('/search?q=1042&limit=10');

		await expect(response.json()).resolves.toMatchObject({
			results: [
				{
					kind: 'record',
					table: 'service_requests',
					title: '#1042',
					subtitle: 'Standing water behind the school',
				},
			],
		});
	});

	// The matched field is what makes a contact's email visible as the reason the
	// row appeared, so a match away from the title is labelled rather than bare.
	it('labels a subtitle drawn from a field the title did not use', async () => {
		const response = await app(
			row({
				source_table: 'contacts',
				fields: { contact_name: 'Radhika Patel', email: 'radhi19@gmail.com' },
				matched_field: 'email',
			}),
		).request('/search?q=radhi19&limit=10');

		await expect(response.json()).resolves.toMatchObject({
			results: [{ title: 'Radhika Patel', subtitle: 'Email: radhi19@gmail.com' }],
		});
	});

	it('sends a route’s type so the client can pick the right tree', async () => {
		const response = await app(
			row({
				source_table: 'routes',
				fields: { route_name: 'North run' },
				display: { route_type: 'trap' },
				matched_field: 'route_name',
			}),
		).request('/search?q=north&limit=10');

		await expect(response.json()).resolves.toMatchObject({
			results: [{ table: 'routes', routeType: 'trap', subtitle: 'Trap route' }],
		});
	});
});

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
const targetId = '3b2c1a90-7d4e-4f88-9a02-5c6d7e8f9012';

/** One reader row, with the parts a composition case does not care about filled in. */
function row(overrides: {
	readonly source_table: string;
	readonly fields: Record<string, string>;
	readonly display?: Record<string, string>;
	readonly matched_field: string;
}) {
	return {
		source_id: '8f14e45f-ceea-467a-9c62-1a0f74a1b0e2',
		match_class: 'exact',
		display: {},
		total: '1',
		records: '1',
		comments: '0',
		...overrides,
	};
}

/**
 * The real route over a database that answers one empty result set.
 *
 * The reader opens a transaction and runs one query; this stands in for both, so
 * the tests above reach the parser and the envelope without a Postgres.
 */
function app(...rows: readonly unknown[]): Hono<{ Variables: AuthVariables }> {
	const instance = new Hono<{ Variables: AuthVariables }>();
	registerSearchRoutes(instance, {
		db: fakeDb(rows) as never,
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

/**
 * A database that answers one fixed result set.
 *
 * The reader opens a transaction and runs two statements before its query; this
 * stands in for all three, so these tests reach the parser, the composition and
 * the envelope without a Postgres. The `set local` statements land here too and
 * are answered with the same empty rows, which is what they return anyway.
 */
function fakeDb(rows: readonly unknown[]) {
	// The two `set local` statements run first and must not be handed the result
	// set, or the reader would compose a document out of nothing.
	let remaining = 2;
	const answer = async () => {
		if (remaining > 0) {
			remaining -= 1;
			return { rows: [] };
		}
		return { rows };
	};

	const executor = {
		executeQuery: answer,
		provideConnection: async (run: (connection: unknown) => Promise<unknown>) =>
			await run({ executeQuery: answer }),
		adapter: { supportsReturning: true },
		compileQuery: () => ({ sql: '', parameters: [] }),
		transformQuery: (node: unknown) => node,
		plugins: [],
	};

	return {
		transaction: () => ({
			execute: async (run: (trx: unknown) => Promise<unknown>) =>
				await run({ getExecutor: () => executor }),
		}),
	};
}
