import {
	getOrganizationSettingsRaw,
	getServiceRequestCenter,
	type Kysely,
	listNearbyRecords,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import { resolveOrganizationSettings, serviceRequestContextBounds } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the map-context view for a service request: the operational records
 * within the org's configured radius + time window of the request. The radius
 * and window default to `settings.publicEngagement.serviceRequestContext`
 * (anchored on the request date) and may be overridden per-request via query
 * params so the UI can offer an "adjust" control.
 */
export function registerServiceRequestNearbyRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.get('/map/service-requests/:id/nearby', options.authContextMiddleware, async (context) => {
		const organizationId = context.get('authContext').organization.id;
		const id = context.req.param('id');

		const request = await getServiceRequestCenter(options.db, { organizationId, id });
		if (request === undefined) {
			return context.json({ error: 'not_found', reason: 'Service request not found.' }, 404);
		}

		const settings = resolveOrganizationSettings(
			await getOrganizationSettingsRaw(options.db, { organizationId }),
		).settings;
		const requestContext = settings.publicEngagement.serviceRequestContext;
		const defaults = serviceRequestContextBounds(request.requestDate, requestContext);

		const url = new URL(context.req.url);
		const radiusOverride = parsePositiveNumber(url.searchParams.get('radiusMeters'));
		if (radiusOverride === 'invalid') {
			return context.json(
				{ error: 'invalid_query', reason: 'radiusMeters must be positive.' },
				400,
			);
		}
		const dateFromOverride = parseDate(url.searchParams.get('dateFrom'));
		const dateToOverride = parseDate(url.searchParams.get('dateTo'));
		if (dateFromOverride === 'invalid' || dateToOverride === 'invalid') {
			return context.json({ error: 'invalid_query', reason: 'dates must be YYYY-MM-DD.' }, 400);
		}

		const radiusMeters = radiusOverride ?? defaults.radiusMeters;
		const dateFrom = dateFromOverride ?? defaults.dateFrom;
		const dateTo = dateToOverride ?? defaults.dateTo;

		const items = await listNearbyRecords(options.db, {
			organizationId,
			center: { lat: request.lat, lng: request.lng },
			radiusMeters,
			dateFrom,
			dateTo,
		});

		return context.json({
			request: { id, lat: request.lat, lng: request.lng, requestDate: request.requestDate },
			radius: {
				amount: requestContext.radius.amount,
				unitCode: requestContext.radius.unitCode,
				meters: radiusMeters,
			},
			timeWindow: requestContext.timeWindow,
			dateFrom,
			dateTo,
			items,
		});
	});
}

/** A finite positive number, `undefined` when absent, or `'invalid'` when malformed. */
function parsePositiveNumber(value: string | null): number | undefined | 'invalid' {
	if (value === null) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 'invalid';
}

/** A `YYYY-MM-DD` string, `undefined` when absent, or `'invalid'` when malformed. */
function parseDate(value: string | null): string | undefined | 'invalid' {
	if (value === null) {
		return undefined;
	}
	return DATE_PATTERN.test(value) ? value : 'invalid';
}
