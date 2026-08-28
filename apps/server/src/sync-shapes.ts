/**
 * A shape route per table, derived rather than declared.
 *
 * Three facts make one route, and each comes from the one place that owns it:
 * the path from `shapePathFor`, which the client's collection derives too; the
 * columns from the table's schema, which is also what a client parses a row
 * with; and the tenant predicate from `shape-scopes.ts`, which is the server's
 * alone. Nothing is written twice, so nothing can drift.
 *
 * This replaces fifty-five descriptor files that stated all three per table and
 * carried a fourth — a `syncMode` that was never a fact about a table at all.
 */
import { shapePathFor, syncedColumnsOf, tableSchemas } from '@simmer-mosquito/sync';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { type AuthVariables, createGlobalReadMiddleware } from './auth-middleware.js';
import { ELECTRIC_EXPOSE_HEADERS } from './cors-options.js';
import { isServedScope, type SyncShapeScope, syncShapeScopes } from './shape-scopes.js';

interface ShapeRouteOptions {
	readonly electricUrl: string | null;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly fetch?: typeof fetch;
}

/** One table's route: what the server forces, and who may ask for it. */
interface ShapeRoute {
	readonly table: string;
	readonly path: string;
	readonly columns: readonly string[];
	readonly scope: SyncShapeScope;
	readonly middleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

/**
 * One route per table, and the door follows from the scope.
 *
 * `units`, `genera` and `species` used to be registered a second time under
 * `/admin`, behind the operator middleware, because `apps/admin` could not reach
 * the ordinary path: an operator session has no agency context and the agency
 * middleware refuses it. That prefix is gone. The three tables are `global`
 * scope, meaning `shapeScopeFilter` forces no predicate and the handler never
 * reads an agency context at all — so one route can admit either identity,
 * which is exactly what `createGlobalReadMiddleware` does.
 *
 * The scope decides, not a list. A table that becomes tenant-scoped stops
 * admitting operators the moment its entry in `shape-scopes.ts` changes, rather
 * than when someone remembers to remove it from a second array here.
 */
export function registerSyncShapeRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: ShapeRouteOptions,
): void {
	const globalReadMiddleware = createGlobalReadMiddleware({
		agency: options.authContextMiddleware,
		operator: options.operatorAuthContextMiddleware,
	});

	for (const [table, entry] of Object.entries(syncShapeScopes)) {
		// A withheld table has no route rather than an unscoped one. `users` is the
		// only one, and `shape-scopes.ts` says why.
		if (!isServedScope(entry)) {
			continue;
		}

		registerShapeRoute(app, options, {
			table,
			path: shapePathFor(table),
			columns: columnsOf(table),
			scope: entry,
			// The assertion `createGlobalReadMiddleware` documents, made structural:
			// the wider door is reachable only on the arm where the scope is the
			// literal `'global'`, so a scoped shape cannot be given it by mistake.
			middleware: entry === 'global' ? globalReadMiddleware : options.authContextMiddleware,
		});
	}
}

/**
 * The columns a table's shape may carry: exactly the fields its schema declares.
 *
 * Which is why withholding a column is done in the schema (see `WITHHELD` in
 * `scripts/generate-table-schemas.mjs`) — a column absent there is absent from
 * the shape, and there is no second list that could disagree about it.
 */
function columnsOf(table: string): readonly string[] {
	const schema = tableSchemas[table as keyof typeof tableSchemas];

	if (schema === undefined) {
		throw new Error(`No collection schema for ${table}, so its shape has no column list.`);
	}

	return syncedColumnsOf(schema);
}

function registerShapeRoute(
	app: Hono<{ Variables: AuthVariables }>,
	options: ShapeRouteOptions,
	shape: ShapeRoute,
): void {
	app.get(shape.path, shape.middleware, async (context) =>
		proxyShapeRoute(context, options, shape, undefined),
	);

	// POST carries subset snapshot params in the body (on-demand collections). The
	// forced table/columns/where/params are identical to the GET path; the body is
	// sanitized to subset-only keys so it can only narrow within the forced shape.
	app.post(shape.path, shape.middleware, async (context) =>
		proxyShapeRoute(context, options, shape, await readSubsetBody(context)),
	);
}

function proxyShapeRoute(
	context: Context<{ Variables: AuthVariables }>,
	options: ShapeRouteOptions,
	shape: ShapeRoute,
	subsetBody: Record<string, unknown> | undefined,
): Promise<Response> | Response {
	if (options.electricUrl === null) {
		return context.json({ error: 'electric_url_required' }, 503);
	}

	return proxyElectricShape(context, {
		fetch: options.fetch,
		upstreamRequest: buildElectricShapeRequest({
			electricUrl: options.electricUrl,
			incomingUrl: context.req.url,
			// No case conversion. The schema's field names are the column names, which
			// is the whole point of the collections holding rows as Postgres sends
			// them — `camelToSnake` and its four hand-written exceptions are gone.
			columns: shape.columns,
			table: shape.table,
			...shapeScopeFilter(shape.scope, context),
			...(subsetBody === undefined ? {} : { subsetBody }),
		}),
	});
}

/**
 * The tenant predicate for a shape, derived from the scope declared for its table
 * — never from anything the caller sent. A new scope is a compile error here
 * rather than a route that silently streams unscoped rows.
 */
function shapeScopeFilter(
	scope: SyncShapeScope,
	context: Context<{ Variables: AuthVariables }>,
): { readonly where?: string; readonly params?: readonly string[] } {
	if (scope === 'global') {
		return {};
	}

	const params = [context.get('authContext').organization.id];

	switch (scope) {
		case 'organization':
			return { where: selectedOrganizationWhere, params };
		case 'organization-no-soft-delete':
			return { where: selectedOrganizationOnlyWhere, params };
		case 'organization-or-global':
			return { where: selectedOrganizationOrGlobalWhere, params };
		case 'organization-or-global-no-soft-delete':
			return { where: selectedOrganizationOrGlobalOnlyWhere, params };
		case 'organization-row':
			return { where: selectedOrganizationByIdWhere, params };
		default: {
			const unhandled: never = scope;
			throw new Error(`Unhandled sync shape scope ${String(unhandled)}.`);
		}
	}
}

async function readSubsetBody(
	context: Context<{ Variables: AuthVariables }>,
): Promise<Record<string, unknown>> {
	try {
		const body = await context.req.json();
		return typeof body === 'object' && body !== null && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function buildElectricShapeUrl(input: {
	readonly electricUrl: string;
	readonly incomingUrl: string;
	readonly columns: readonly string[];
	readonly table: string;
	readonly where?: string;
	readonly params?: readonly string[];
}): string {
	return buildElectricShapeRequest(input).url;
}

export function buildElectricShapeRequest(input: {
	readonly electricUrl: string;
	readonly incomingUrl: string;
	readonly columns: readonly string[];
	readonly table: string;
	readonly where?: string;
	readonly params?: readonly string[];
	readonly subsetBody?: unknown;
}): {
	readonly url: string;
	readonly init: RequestInit;
} {
	const upstreamUrl = new URL(input.electricUrl);
	const incomingUrl = new URL(input.incomingUrl);

	// When the client POSTs a subset snapshot, subset params arrive in the request
	// body (GET-with-`subset__*`-query is the legacy path). The body can only ever
	// narrow *within* the forced org-scoped shape — sanitize it so it can never
	// inject table/columns/where/shape params.
	const bodyFromRequest = input.subsetBody !== undefined;
	const subsetBody: Record<string, unknown> = bodyFromRequest
		? sanitizeSubsetBody(input.subsetBody)
		: {};

	for (const [key, value] of incomingUrl.searchParams) {
		if (isSubsetShapeParam(key)) {
			if (!bodyFromRequest) {
				subsetBody[toPostSubsetParam(key)] = parseSubsetParam(key, value);
			}
		} else if (!isServerOwnedShapeParam(key)) {
			upstreamUrl.searchParams.append(key, value);
		}
	}

	upstreamUrl.searchParams.set('table', input.table);
	upstreamUrl.searchParams.set('columns', input.columns.join(','));
	if (input.where !== undefined) {
		upstreamUrl.searchParams.set('where', input.where);
	}
	if (input.params !== undefined) {
		for (const [index, value] of input.params.entries()) {
			upstreamUrl.searchParams.set(`params[${index + 1}]`, value);
		}
	}

	// A POST from the client is a subset snapshot request even if the sanitized body
	// is empty, so preserve the method; the legacy GET path only POSTs upstream when
	// it actually carried `subset__*` params.
	const usePost = bodyFromRequest || Object.keys(subsetBody).length > 0;

	return {
		url: upstreamUrl.toString(),
		init: usePost
			? {
					method: 'POST',
					body: JSON.stringify(subsetBody),
				}
			: {},
	};
}

async function proxyElectricShape(
	context: Context<{ Variables: AuthVariables }>,
	options: {
		readonly upstreamRequest: {
			readonly url: string;
			readonly init: RequestInit;
		};
		readonly fetch: typeof fetch | undefined;
	},
): Promise<Response> {
	const upstream = await (options.fetch ?? fetch)(options.upstreamRequest.url, {
		...options.upstreamRequest.init,
		headers: {
			accept: context.req.header('accept') ?? 'application/json',
			...(options.upstreamRequest.init.body === undefined
				? {}
				: { 'content-type': 'application/json' }),
		},
	});
	const headers = copyElectricHeaders(upstream.headers);

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers,
	});
}

function copyElectricHeaders(headers: Headers): Headers {
	const copied = new Headers();

	for (const [key, value] of headers) {
		if (!blockedProxyResponseHeaders.has(key.toLowerCase())) {
			copied.set(key, value);
		}
	}

	// Set here so the proxied response is complete on its own, and declared in
	// `cors-options.ts` because that is the copy the browser receives: Hono's
	// `cors()` middleware runs after this handler and overwrites the header.
	copied.set('access-control-expose-headers', ELECTRIC_EXPOSE_HEADERS.join(', '));
	/*
	 * Electric's own caching headers are replaced, not forwarded.
	 *
	 * Electric answers every shape request with
	 * `public, max-age=604800, s-maxage=3600, stale-while-revalidate=2629746`.
	 * That is right for the deployment it assumes — a CDN in front of a public,
	 * immutable shape log, keyed on the full query string. It is wrong for this
	 * proxy on both counts.
	 *
	 * `public` is wrong because these routes sit behind the session cookie and the
	 * server *forces* the org-scoped `where` (see the shape route handlers). Two
	 * operators hit byte-identical URLs and must not receive each other's rows, so
	 * a response that any shared cache may store is a tenancy leak waiting on a
	 * proxy nobody remembered was there.
	 *
	 * The week-long `max-age` is wrong because `offset=-1` is not immutable: it is
	 * "the snapshot as of now", and its URL is stable across days. Chrome cached it
	 * to disk and replayed month-old snapshots — handle and log offset included —
	 * which desynced the client from Electric's current position. The client then
	 * marked the handle expired, refetched, got the same (live) handle back, and
	 * logged that a CDN was serving stale data. There was no CDN; it was the
	 * browser doing exactly what we told it.
	 *
	 * `no-store` rather than a shorter `max-age` because Electric sends no `ETag`
	 * or `Last-Modified`, so there is nothing to revalidate against — a cache
	 * entry here can only ever be served blind. Losing the cache costs one
	 * snapshot fetch per collection per load; live updates ride the long-poll,
	 * which is untouched.
	 */
	copied.set('cache-control', 'private, no-store');
	copied.set('vary', 'cookie');

	return copied;
}

const blockedProxyResponseHeaders = new Set([
	'connection',
	'content-encoding',
	'content-length',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
]);

// `secret` is server-owned: when ELECTRIC_SECRET is configured it is folded into
// the base electricUrl (see readElectricUrl in env.ts), so an incoming request
// must never be able to append/override it.
const serverOwnedShapeParams = new Set(['columns', 'table', 'where', 'secret']);
const subsetShapeParamPrefix = 'subset__';
// Electric's POST subset body keys (unprefixed). These narrow *within* the forced
// org shape — table/columns/shape-where/shape-params are never sourced from the body.
const allowedSubsetBodyKeys = new Set([
	'where',
	'where_expr',
	'params',
	'limit',
	'offset',
	'order_by',
	'order_by_expr',
]);
const selectedOrganizationOnlyWhere = 'organization_id = $1';
const selectedOrganizationWhere = 'organization_id = $1 and deleted_at is null';
const selectedOrganizationByIdWhere = 'id = $1 and deleted_at is null';
const selectedOrganizationOrGlobalWhere =
	'(organization_id = $1 or organization_id is null) and deleted_at is null';
const selectedOrganizationOrGlobalOnlyWhere = '(organization_id = $1 or organization_id is null)';
function isServerOwnedShapeParam(value: string): boolean {
	return serverOwnedShapeParams.has(value) || /^params\[\d+\]$/.test(value);
}

function isSubsetShapeParam(value: string): boolean {
	return value.startsWith(subsetShapeParamPrefix);
}

function toPostSubsetParam(value: string): string {
	return value.slice(subsetShapeParamPrefix.length);
}

function sanitizeSubsetBody(body: unknown): Record<string, unknown> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return {};
	}

	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body)) {
		if (allowedSubsetBodyKeys.has(key)) {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

function parseSubsetParam(key: string, value: string): unknown {
	if (key === 'subset__params') {
		return JSON.parse(value);
	}
	if (key === 'subset__limit' || key === 'subset__offset') {
		return Number(value);
	}

	return value;
}
