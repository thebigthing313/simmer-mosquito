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
import { parseOptionalVocabularyListFilter, uuidPattern } from './map-tiles.js';
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
 * shape plus a distance. The radius and window are
 * `settings.publicEngagement.serviceRequestContext`, and a person who wants a
 * wider or narrower view changes them on the Organization's settings page. The
 * route used to parse a `radiusMeters`, a `dateFrom` and a `dateTo` override
 * beside them, for an adjust control nothing ever built (#1110); one sent now
 * is an unknown key and is ignored the way any other is.
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
 * categories it draws means the cap counts only those. When the cap is hit the
 * answer says so, and names the cap, since a dense radius otherwise draws a
 * map that looks complete (#1141).
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
		let bounds: ServiceRequestContextBounds;
		try {
			bounds = serviceRequestContextBounds(
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

		const query = readNearbyQuery(new URL(context.req.url).searchParams);
		if (!query.ok) {
			return context.json({ error: 'invalid_query', reason: query.reason }, 400);
		}

		const { items, truncated, limit } = await readers.listNearbyRecords(options.db, {
			organizationId,
			request: { id, lat: request.lat, lng: request.lng },
			radiusMeters: bounds.radiusMeters,
			dateFrom: bounds.dateFrom,
			dateTo: bounds.dateTo,
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
				meters: bounds.radiusMeters,
			},
			timeWindow: requestContext.timeWindow,
			dateFrom: bounds.dateFrom,
			dateTo: bounds.dateTo,
			dateToFrom: windowEndOf(bounds, request.closedDate),
			families: query.families,
			items,
			// The reader's cap, and whether it cut the result. The page says "the
			// nearest 2,000" off these rather than spelling the number (#1141).
			truncated,
			limit,
		});
	});
}

/**
 * What the caller narrows the read to. The families are the caller's where the
 * query names them and the three operational ones where it does not. The
 * categories have no default of their own: absent, the reader takes every
 * category of the families named. Both go through the same parser every other
 * `/map/*` query uses. The radius and the window are not here, because they
 * are the settings' and the request's rather than the caller's.
 */
function readNearbyQuery(searchParams: URLSearchParams):
	| {
			readonly ok: true;
			readonly families: readonly ActivityFamily[];
			readonly categories: readonly ActivityCategory[] | undefined;
	  }
	| { readonly ok: false; readonly reason: string } {
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
		families: families.value ?? DEFAULT_NEARBY_FAMILIES,
		categories: categories.value,
	};
}

/**
 * Which end the computed window has, named for the response. The domain says
 * whether the anchor beat the setting, and the row says whether the anchor it
 * was handed was the close day or today.
 */
function windowEndOf(
	bounds: ServiceRequestContextBounds,
	closedDate: string | null,
): NearbyWindowEnd {
	if (bounds.dateToFrom === 'setting') {
		return 'setting';
	}
	return closedDate === null ? 'today' : 'close';
}
