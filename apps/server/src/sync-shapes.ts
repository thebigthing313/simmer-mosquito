import {
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	generaSyncDescriptor,
	habitatTypesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	profilesSyncDescriptor,
	routesSyncDescriptor,
	speciesSyncDescriptor,
	tagsSyncDescriptor,
	unitsSyncDescriptor,
} from '@simmer-mosquito/sync';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

export function registerSyncShapeRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly electricUrl: string | null;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly fetch?: typeof fetch;
	},
): void {
	app.get('/sync/shapes/units', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: unitsSyncDescriptor.columns.map(camelToSnake),
				table: unitsSyncDescriptor.table,
			}),
		});
	});

	app.get('/sync/shapes/profiles', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: profilesSyncDescriptor.columns.map(camelToSnake),
				table: profilesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/genera', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: generaSyncDescriptor.columns.map(camelToSnake),
				table: generaSyncDescriptor.table,
			}),
		});
	});

	app.get('/sync/shapes/species', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: speciesSyncDescriptor.columns.map(camelToSnake),
				table: speciesSyncDescriptor.table,
			}),
		});
	});

	app.get('/sync/shapes/organization-species', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: organizationSpeciesSyncDescriptor.columns.map(camelToSnake),
				table: organizationSpeciesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/collection-methods', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: collectionMethodsSyncDescriptor.columns.map(camelToSnake),
				table: collectionMethodsSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/collection-lures', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: collectionLuresSyncDescriptor.columns.map(camelToSnake),
				table: collectionLuresSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/habitat-types', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: habitatTypesSyncDescriptor.columns.map(camelToSnake),
				table: habitatTypesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/tags', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: tagsSyncDescriptor.columns.map(camelToSnake),
				table: tagsSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/routes', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamUrl: buildElectricShapeUrl({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: routesSyncDescriptor.columns.map(camelToSnake),
				table: routesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});
}

export function buildElectricShapeUrl(input: {
	readonly electricUrl: string;
	readonly incomingUrl: string;
	readonly columns: readonly string[];
	readonly table: string;
	readonly where?: string;
	readonly params?: readonly string[];
}): string {
	const upstreamUrl = new URL(input.electricUrl);
	const incomingUrl = new URL(input.incomingUrl);

	for (const [key, value] of incomingUrl.searchParams) {
		if (!isServerOwnedShapeParam(key)) {
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

	return upstreamUrl.toString();
}

async function proxyElectricShape(
	context: Context<{ Variables: AuthVariables }>,
	options: {
		readonly upstreamUrl: string;
		readonly fetch: typeof fetch | undefined;
	},
): Promise<Response> {
	const upstream = await (options.fetch ?? fetch)(options.upstreamUrl, {
		headers: {
			accept: context.req.header('accept') ?? 'application/json',
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

const serverOwnedShapeParams = new Set(['columns', 'table', 'where']);
const selectedOrganizationWhere = 'organization_id = $1 and deleted_at is null';
const electricExposeHeaders = [
	'electric-offset',
	'electric-handle',
	'electric-schema',
	'electric-cursor',
];

function camelToSnake(value: string): string {
	return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isServerOwnedShapeParam(value: string): boolean {
	return serverOwnedShapeParams.has(value) || /^params\[\d+\]$/.test(value);
}
