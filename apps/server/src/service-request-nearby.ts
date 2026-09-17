import {
	DEFAULT_NEARBY_FAMILIES,
	getOrganizationSettingsRaw,
	getServiceRequestCenter,
	type Kysely,
	listNearbyRecords,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import {
	ACTIVITY_CATEGORIES,
	ACTIVITY_FAMILIES,
	type ActivityCategory,
	type ActivityFamily,
	DomainValidationError,
	type NearbyWindowEnd,
	resolveOrganizationSettings,
	type ServiceRequestContextBounds,
	serviceRequestContextBounds,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import {
	parseOptionalDateFilter,
	parseOptionalPositiveNumber,
	parseOptionalVocabularyListFilter,
	uuidPattern,
} from './map-tiles.js';
import { todayInTimeZone } from './organization-day.js';

/**
 * The three reads the route makes, injectable so a suite can drive it without
 * a database, the way `registerMapTileRoutes` takes its `readers`.
 */
const defaultNearbyReaders = {
	getServiceRequestCenter,
	getOrganizationSettings: getOrganizationSettingsRaw,
	listNearbyRecords,
};

type NearbyReaders = typeof defaultNearbyReaders;

/**
 * Reads the map-context view for a service request: the records within the
 * org's configured radius + time window of the request, in the activity row
 * shape plus a distance. The radius and window default to
 * `settings.publicEngagement.serviceRequestContext` and may be overridden
 * per-request via query params so the UI can offer an "adjust" control.
 * `families` names which of the four activity families to read; left out, it
 * is the three operational ones, and the public-engagement family is what
 * returns the outreach actions and the other requests around this one.
 * `categories` narrows the read inside those families to the record kinds
 * named, and the two compose as an intersection. It exists because the reader
 * caps the union at 2000 rows nearest-first before anything is dropped, and
 * `publicEngagement` holds two shapes: the service request page draws the
 * other requests and not the outreach, and while it dropped outreach off the
 * answer a dense radius could fill the cap with outreach actions and cut a
 * nearer request with nothing on the page saying so (#1114). Asking for the
 * categories it draws means the cap counts only those.
 *
 * The window starts `daysBefore` ahead of the request date and ends on the
 * later of `daysAfter` past it and the request's end anchor: the day it was
 * closed, or today while it is open (#1084). Both anchor days are the
 * Organization's calendar days, which is the rule every operational date
 * follows (#154, #156), so the close is read back through the same zone the
 * collections in the window are dated in, and today is read through
 * `todayInTimeZone` rather than the server's clock. The response names which
 * of the three set `dateTo`, so the page can say so beside a range that runs
 * past the setting (#1085).
 */
export function registerServiceRequestNearbyRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly readers?: Partial<NearbyReaders>;
		/** The clock behind "today", injectable for the reason the readers are. */
		readonly now?: () => Date;
	},
): void {
	const readers: NearbyReaders = { ...defaultNearbyReaders, ...options.readers };
	const now = options.now ?? (() => new Date());

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

		// Settings ahead of the request, because the close day is read in the
		// Organization's zone and the zone is a setting.
		const settings = resolveOrganizationSettings(
			await readers.getOrganizationSettings(options.db, { organizationId }),
		).settings;
		const requestContext = settings.publicEngagement.serviceRequestContext;

		const request = await readers.getServiceRequestCenter(options.db, {
			organizationId,
			id,
			timeZone: settings.timezone,
		});
		if (request === undefined) {
			return context.json({ error: 'not_found', reason: 'Service request not found.' }, 404);
		}

		// The window is anchored on the stored request date, and `request_date` is a
		// `date NOT NULL` read back through `to_char`, so there is no row this can
		// refuse. It is here because the alternative to reporting it is what #681
		// was: a date nothing could read became a 1970 window, which comes back
		// empty and draws a map saying nothing happened near this request. A read
		// that cannot answer says so instead. 500 rather than 400, because nothing
		// the caller sent is wrong.
		let defaults: ServiceRequestContextBounds;
		try {
			defaults = serviceRequestContextBounds(
				request.requestDate,
				requestContext,
				request.closedDate ?? todayInTimeZone(settings.timezone, now()),
			);
		} catch (error) {
			if (!(error instanceof DomainValidationError)) {
				throw error;
			}
			return context.json(
				{ error: 'unreadable_request_date', reason: 'Service request date could not be read.' },
				500,
			);
		}

		const query = readNearbyQuery(
			new URL(context.req.url).searchParams,
			defaults,
			windowEndOf(defaults, request.closedDate),
		);
		if (!query.ok) {
			return context.json({ error: 'invalid_query', reason: query.reason }, 400);
		}

		const items = await readers.listNearbyRecords(options.db, {
			organizationId,
			request: { id, lat: request.lat, lng: request.lng },
			radiusMeters: query.radiusMeters,
			dateFrom: query.dateFrom,
			dateTo: query.dateTo,
			families: query.families,
			categories: query.categories,
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
				meters: query.radiusMeters,
			},
			timeWindow: requestContext.timeWindow,
			dateFrom: query.dateFrom,
			dateTo: query.dateTo,
			dateToFrom: query.dateToFrom,
			families: query.families,
			items,
		});
	});
}

/**
 * What the read is asked: the radius, the window, the families and the
 * categories, each the caller's where the query names one and the default
 * where it does not. The categories have no default of their own: absent, the
 * reader takes every category of the families named.
 *
 * The radius and window defaults come from
 * `settings.publicEngagement.serviceRequestContext`; the UI offers an "adjust"
 * control, and the overrides are what it sends. They go through the same
 * parsers every other `/map/*` query uses. This module used to carry its own
 * `DATE_PATTERN` and a pair of parsers that answered the string `'invalid'`
 * instead of the `{ ok: false, reason }` union everything else returns, which
 * is two protocols on one path prefix.
 */
function readNearbyQuery(
	searchParams: URLSearchParams,
	defaults: ServiceRequestContextBounds,
	defaultEnd: NearbyWindowEnd,
):
	| {
			readonly ok: true;
			readonly radiusMeters: number;
			readonly dateFrom: string;
			readonly dateTo: string;
			readonly dateToFrom: NearbyWindowEnd;
			readonly families: readonly ActivityFamily[];
			readonly categories: readonly ActivityCategory[] | undefined;
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

	const families = parseOptionalVocabularyListFilter(searchParams, 'families', ACTIVITY_FAMILIES);
	if (!families.ok) {
		return families;
	}

	const categories = parseOptionalVocabularyListFilter(
		searchParams,
		'categories',
		ACTIVITY_CATEGORIES,
	);
	if (!categories.ok) {
		return categories;
	}

	return {
		ok: true,
		radiusMeters: radiusMeters.value ?? defaults.radiusMeters,
		dateFrom: dateFrom.value ?? defaults.dateFrom,
		...resolvedWindowEnd(dateTo.value, defaults, defaultEnd),
		families: families.value ?? DEFAULT_NEARBY_FAMILIES,
		categories: categories.value,
	};
}

/** The window's end and its name together. A caller's own end is nobody's anchor. */
function resolvedWindowEnd(
	override: string | undefined,
	defaults: ServiceRequestContextBounds,
	defaultEnd: NearbyWindowEnd,
): { readonly dateTo: string; readonly dateToFrom: NearbyWindowEnd } {
	return override === undefined
		? { dateTo: defaults.dateTo, dateToFrom: defaultEnd }
		: { dateTo: override, dateToFrom: 'query' };
}

/**
 * Which end the computed window has, named for the response. The domain says
 * whether the anchor beat the setting, and the row says whether the anchor it
 * was handed was the close day or today.
 */
function windowEndOf(
	defaults: ServiceRequestContextBounds,
	closedDate: string | null,
): NearbyWindowEnd {
	if (defaults.dateToFrom === 'setting') {
		return 'setting';
	}
	return closedDate === null ? 'today' : 'close';
}
