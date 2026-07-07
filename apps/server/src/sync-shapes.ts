import {
	additionalPersonnelSyncDescriptor,
	addressesSyncDescriptor,
	applicationBatchesSyncDescriptor,
	applicationMethodsSyncDescriptor,
	applicationsSyncDescriptor,
	assignmentItemsSyncDescriptor,
	assignmentsSyncDescriptor,
	biocontrolActionsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionSpeciesSyncDescriptor,
	collectionsSyncDescriptor,
	commentsSyncDescriptor,
	contactsSyncDescriptor,
	currentOrganizationSyncDescriptor,
	equipmentSyncDescriptor,
	formulationInsecticidesSyncDescriptor,
	formulationsSyncDescriptor,
	generaSyncDescriptor,
	habitatsSyncDescriptor,
	habitatTypesSyncDescriptor,
	insecticideBatchesSyncDescriptor,
	insecticidesSyncDescriptor,
	inspectionsSyncDescriptor,
	membershipsSyncDescriptor,
	missionItemsSyncDescriptor,
	missionNotificationsSyncDescriptor,
	missionsSyncDescriptor,
	notificationRegistrationsSyncDescriptor,
	notificationRegistrationTypesSyncDescriptor,
	notificationTypesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	outreachActionsSyncDescriptor,
	outreachMethodsSyncDescriptor,
	profilesSyncDescriptor,
	regionFoldersSyncDescriptor,
	regionsSyncDescriptor,
	requestedControlActionsSyncDescriptor,
	routeItemsSyncDescriptor,
	routesSyncDescriptor,
	sampleSpeciesSyncDescriptor,
	samplesSyncDescriptor,
	serviceRequestsSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	sourceReductionsSyncDescriptor,
	speciesSyncDescriptor,
	tagItemsSyncDescriptor,
	tagsSyncDescriptor,
	trapsSyncDescriptor,
	unitsSyncDescriptor,
	vehiclesSyncDescriptor,
	weatherSourceSubscriptionsSyncDescriptor,
	weatherSourcesSyncDescriptor,
	weatherSummariesSyncDescriptor,
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
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/addresses',
		descriptor: addressesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/habitats',
		descriptor: habitatsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/inspections',
		descriptor: inspectionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/samples',
		descriptor: samplesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/sample-species',
		descriptor: sampleSpeciesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/region-folders',
		descriptor: regionFoldersSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/regions',
		descriptor: regionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/traps',
		descriptor: trapsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/collections',
		descriptor: collectionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/collection-species',
		descriptor: collectionSpeciesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/comments',
		descriptor: commentsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/tag-items',
		descriptor: tagItemsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/additional-personnel',
		descriptor: additionalPersonnelSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/route-items',
		descriptor: routeItemsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/assignments',
		descriptor: assignmentsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/assignment-items',
		descriptor: assignmentItemsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/formulations',
		descriptor: formulationsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/formulation-insecticides',
		descriptor: formulationInsecticidesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/applications',
		descriptor: applicationsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/application-batches',
		descriptor: applicationBatchesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/source-reductions',
		descriptor: sourceReductionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/outreach-actions',
		descriptor: outreachActionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/biocontrol-actions',
		descriptor: biocontrolActionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/contacts',
		descriptor: contactsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/service-requests',
		descriptor: serviceRequestsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/requested-control-actions',
		descriptor: requestedControlActionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/missions',
		descriptor: missionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/mission-items',
		descriptor: missionItemsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/notification-registrations',
		descriptor: notificationRegistrationsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/notification-registration-types',
		descriptor: notificationRegistrationTypesSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/mission-notifications',
		descriptor: missionNotificationsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/weather-sources',
		descriptor: weatherSourcesSyncDescriptor,
		where: selectedOrganizationOrGlobalWhere,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/weather-source-subscriptions',
		descriptor: weatherSourceSubscriptionsSyncDescriptor,
	});
	registerSelectedOrganizationShapeRoute(app, options, {
		path: '/sync/shapes/weather-summaries',
		descriptor: weatherSummariesSyncDescriptor,
		where: selectedOrganizationOrGlobalOnlyWhere,
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
		readonly where?: string;
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
				where: shape.where ?? selectedOrganizationWhere,
				params: [authContext.organization.id],
			}),
		});
	});

	// POST carries subset snapshot params in the body (on-demand collections). The
	// forced table/columns/where/params are identical to the GET path; the body is
	// sanitized to subset-only keys so it can only narrow within the org shape.
	app.post(shape.path, options.authContextMiddleware, async (context) => {
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
				where: shape.where ?? selectedOrganizationWhere,
				params: [authContext.organization.id],
				subsetBody: await readSubsetBody(context),
			}),
		});
	});
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
