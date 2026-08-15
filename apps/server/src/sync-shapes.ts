import {
	generaSyncDescriptor,
	type SyncShapeRoute,
	speciesSyncDescriptor,
	syncShapeDescriptors,
	unitsSyncDescriptor,
} from '@simmer-mosquito/sync';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { type SyncShapeScope, shapeScopeOf } from './shape-scopes.js';

interface ShapeRouteOptions {
	readonly electricUrl: string | null;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly fetch?: typeof fetch;
}

// The operator console reads the global taxonomy through its own path prefix and
// its own middleware. Same descriptors, same forced shape — a different door.
const operatorShapeDescriptors = [
	unitsSyncDescriptor,
	generaSyncDescriptor,
	speciesSyncDescriptor,
] as const;

export function registerSyncShapeRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: ShapeRouteOptions,
): void {
	for (const descriptor of syncShapeDescriptors) {
		registerShapeRoute(app, options, {
			path: descriptor.endpointPath,
			middleware: options.authContextMiddleware,
			descriptor,
		});
	}

	for (const descriptor of operatorShapeDescriptors) {
		registerShapeRoute(app, options, {
			path: `/admin${descriptor.endpointPath}`,
			middleware: options.operatorAuthContextMiddleware,
			descriptor,
		});
	}
}

function registerShapeRoute(
	app: Hono<{ Variables: AuthVariables }>,
	options: ShapeRouteOptions,
	shape: {
		readonly path: string;
		readonly middleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly descriptor: SyncShapeRoute;
	},
): void {
	// Resolved once, here, rather than per request: a table with no declared scope
	// stops the server from starting instead of answering the request that needed
	// it. See `shape-scopes.ts` — the descriptor no longer carries a scope of its
	// own, so there is nothing for this to disagree with.
	const scope = shapeScopeOf(shape.descriptor.table);

	app.get(shape.path, shape.middleware, async (context) =>
		proxyShapeRoute(context, options, shape.descriptor, scope, undefined),
	);

	// POST carries subset snapshot params in the body (on-demand collections). The
	// forced table/columns/where/params are identical to the GET path; the body is
	// sanitized to subset-only keys so it can only narrow within the forced shape.
	app.post(shape.path, shape.middleware, async (context) =>
		proxyShapeRoute(context, options, shape.descriptor, scope, await readSubsetBody(context)),
	);
}

function proxyShapeRoute(
	context: Context<{ Variables: AuthVariables }>,
	options: ShapeRouteOptions,
	descriptor: SyncShapeRoute,
	scope: SyncShapeScope,
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
			columns: descriptor.columns.map(camelToSnake),
			table: descriptor.table,
			...shapeScopeFilter(scope, context),
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

	copied.set('access-control-expose-headers', electricExposeHeaders.join(', '));
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
const electricExposeHeaders = [
	'electric-offset',
	'electric-handle',
	'electric-schema',
	'electric-cursor',
];

function camelToSnake(value: string): string {
	if (value === 'addressLine1') {
		return 'address_line_1';
	}
	if (value === 'addressLine2') {
		return 'address_line_2';
	}
	if (value === 'mailingAddressLine1') {
		return 'mailing_address_line_1';
	}
	if (value === 'mailingAddressLine2') {
		return 'mailing_address_line_2';
	}

	return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

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
