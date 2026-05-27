import {
	applicationMethodsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	currentOrganizationSyncDescriptor,
	equipmentSyncDescriptor,
	generaSyncDescriptor,
	habitatTypesSyncDescriptor,
	insecticideBatchesSyncDescriptor,
	insecticidesSyncDescriptor,
	membershipsSyncDescriptor,
	notificationTypesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	outreachMethodsSyncDescriptor,
	profilesSyncDescriptor,
	routesSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	speciesSyncDescriptor,
	tagsSyncDescriptor,
	unitsSyncDescriptor,
	vehiclesSyncDescriptor,
} from '@simmer-mosquito/sync';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

export function registerSyncShapeRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly electricUrl: string | null;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly fetch?: typeof fetch;
	},
): void {
	app.get('/sync/shapes/units', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamRequest: buildElectricShapeRequest({
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
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: profilesSyncDescriptor.columns.map(camelToSnake),
				table: profilesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/memberships', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: membershipsSyncDescriptor.columns.map(camelToSnake),
				table: membershipsSyncDescriptor.table,
				where: selectedOrganizationOnlyWhere,
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
			upstreamRequest: buildElectricShapeRequest({
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
			upstreamRequest: buildElectricShapeRequest({
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
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: organizationSpeciesSyncDescriptor.columns.map(camelToSnake),
				table: organizationSpeciesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/sync/shapes/organization', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: currentOrganizationSyncDescriptor.columns.map(camelToSnake),
				table: currentOrganizationSyncDescriptor.table,
				where: selectedOrganizationByIdWhere,
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
			upstreamRequest: buildElectricShapeRequest({
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
			upstreamRequest: buildElectricShapeRequest({
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
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: habitatTypesSyncDescriptor.columns.map(camelToSnake),
				table: habitatTypesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/application-methods',
		descriptor: applicationMethodsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/source-reduction-methods',
		descriptor: sourceReductionMethodsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/outreach-methods',
		descriptor: outreachMethodsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/biocontrol-methods',
		descriptor: biocontrolMethodsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/vehicles',
		descriptor: vehiclesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/equipment',
		descriptor: equipmentSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/insecticides',
		descriptor: insecticidesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/insecticide-batches',
		descriptor: insecticideBatchesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/notification-types',
		descriptor: notificationTypesSyncDescriptor,
	});

	app.get('/sync/shapes/tags', options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamRequest: buildElectricShapeRequest({
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
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: routesSyncDescriptor.columns.map(camelToSnake),
				table: routesSyncDescriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	app.get('/admin/sync/shapes/units', options.operatorAuthContextMiddleware, async (context) =>
		proxyGlobalShape(context, options, {
			columns: unitsSyncDescriptor.columns.map(camelToSnake),
			table: unitsSyncDescriptor.table,
		}),
	);

	app.get('/admin/sync/shapes/genera', options.operatorAuthContextMiddleware, async (context) =>
		proxyGlobalShape(context, options, {
			columns: generaSyncDescriptor.columns.map(camelToSnake),
			table: generaSyncDescriptor.table,
		}),
	);

	app.get('/admin/sync/shapes/species', options.operatorAuthContextMiddleware, async (context) =>
		proxyGlobalShape(context, options, {
			columns: speciesSyncDescriptor.columns.map(camelToSnake),
			table: speciesSyncDescriptor.table,
		}),
	);
}

function registerSelectedOrganizationShapeRoute(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly electricUrl: string | null;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly fetch?: typeof fetch;
	},
	shape: {
		readonly path: string;
		readonly descriptor: {
			readonly columns: readonly string[];
			readonly table: string;
		};
	},
): void {
	app.get(shape.path, options.authContextMiddleware, async (context) => {
		if (options.electricUrl === null) {
			return context.json({ error: 'electric_url_required' }, 503);
		}

		const authContext = context.get('authContext');

		return proxyElectricShape(context, {
			fetch: options.fetch,
			upstreamRequest: buildElectricShapeRequest({
				electricUrl: options.electricUrl,
				incomingUrl: context.req.url,
				columns: shape.descriptor.columns.map(camelToSnake),
				table: shape.descriptor.table,
				where: selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});
}

function proxyGlobalShape(
	context: Context<{ Variables: AuthVariables }>,
	options: {
		readonly electricUrl: string | null;
		readonly fetch?: typeof fetch;
	},
	shape: {
		readonly columns: readonly string[];
		readonly table: string;
	},
): Promise<Response> | Response {
	if (options.electricUrl === null) {
		return context.json({ error: 'electric_url_required' }, 503);
	}

	return proxyElectricShape(context, {
		fetch: options.fetch,
		upstreamRequest: buildElectricShapeRequest({
			electricUrl: options.electricUrl,
			incomingUrl: context.req.url,
			columns: shape.columns,
			table: shape.table,
		}),
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
	return buildElectricShapeRequest(input).url;
}

export function buildElectricShapeRequest(input: {
	readonly electricUrl: string;
	readonly incomingUrl: string;
	readonly columns: readonly string[];
	readonly table: string;
	readonly where?: string;
	readonly params?: readonly string[];
}): {
	readonly url: string;
	readonly init: RequestInit;
} {
	const upstreamUrl = new URL(input.electricUrl);
	const incomingUrl = new URL(input.incomingUrl);
	const subsetBody: Record<string, unknown> = {};

	for (const [key, value] of incomingUrl.searchParams) {
		if (isSubsetShapeParam(key)) {
			subsetBody[toPostSubsetParam(key)] = parseSubsetParam(key, value);
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

	const hasSubsetBody = Object.keys(subsetBody).length > 0;

	return {
		url: upstreamUrl.toString(),
		init: hasSubsetBody
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
const subsetShapeParamPrefix = 'subset__';
const selectedOrganizationOnlyWhere = 'organization_id = $1';
const selectedOrganizationWhere = 'organization_id = $1 and deleted_at is null';
const selectedOrganizationByIdWhere = 'id = $1 and deleted_at is null';
const electricExposeHeaders = [
	'electric-offset',
	'electric-handle',
	'electric-schema',
	'electric-cursor',
];

function camelToSnake(value: string): string {
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

function parseSubsetParam(key: string, value: string): unknown {
	if (key === 'subset__params') {
		return JSON.parse(value);
	}
	if (key === 'subset__limit' || key === 'subset__offset') {
		return Number(value);
	}

	return value;
}
