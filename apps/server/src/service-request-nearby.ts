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
import { parseOptionalDateFilter, parseOptionalPositiveNumber, uuidPattern } from './map-tiles.js';

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
		// Every other `/map/*` by-id route refuses a non-UUID here. This one used to
		// hand it to Postgres, which answered with a cast error and a 500.
		if (!uuidPattern.test(id)) {
			return context.json(
				{ error: 'invalid_id', reason: 'Service request id must be a UUID.' },
				400,
			);
		}

		const request = await getServiceRequestCenter(options.db, { organizationId, id });
		if (request === undefined) {
			return context.json({ error: 'not_found', reason: 'Service request not found.' }, 404);
		}

		const settings = resolveOrganizationSettings(
			await getOrganizationSettingsRaw(options.db, { organizationId }),
		).settings;
		const requestContext = settings.publicEngagement.serviceRequestContext;
		const defaults = serviceRequestContextBounds(request.requestDate, requestContext);

		const overrides = readNearbyOverrides(new URL(context.req.url).searchParams);
		if (!overrides.ok) {
			return context.json({ error: 'invalid_query', reason: overrides.reason }, 400);
		}

		const radiusMeters = overrides.radiusMeters ?? defaults.radiusMeters;
		const dateFrom = overrides.dateFrom ?? defaults.dateFrom;
		const dateTo = overrides.dateTo ?? defaults.dateTo;

		const items = await listNearbyRecords(options.db, {
			organizationId,
			center: { lat: request.lat, lng: request.lng },
			radiusMeters,
			dateFrom,
			dateTo,
			// The same settings the radius and window came from. A collection's
			// `collected_at` becomes a day in this zone, so the window here means the
			// same days the operator picked.
			timeZone: settings.timezone,
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

/**
 * The per-request overrides for the radius and time window.
 *
 * The defaults come from `settings.publicEngagement.serviceRequestContext`; the
 * UI offers an "adjust" control, and these are what it sends. They go through
 * the same parsers every other `/map/*` query uses — this module used to carry
 * its own `DATE_PATTERN` and a pair of parsers that answered the string
 * `'invalid'` instead of the `{ ok: false, reason }` union everything else
 * returns, which is two protocols on one path prefix.
 */
function readNearbyOverrides(searchParams: URLSearchParams):
	| {
			readonly ok: true;
			readonly radiusMeters: number | undefined;
			readonly dateFrom: string | undefined;
			readonly dateTo: string | undefined;
	  }
	| { readonly ok: false; readonly reason: string } {
	const radiusMeters = parseOptionalPositiveNumber(searchParams, 'radiusMeters');
	if (!radiusMeters.ok) {
		return radiusMeters;
	}

	const dateFrom = parseOptionalDateFilter(searchParams, 'dateFrom');
	if (!dateFrom.ok) {
		return dateFrom;
	}

	const dateTo = parseOptionalDateFilter(searchParams, 'dateTo');
	if (!dateTo.ok) {
		return dateTo;
	}

	return {
		ok: true,
		radiusMeters: radiusMeters.value,
		dateFrom: dateFrom.value,
		dateTo: dateTo.value,
	};
}
