import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

const geocodioBaseUrl = 'https://api.geocod.io/v1.12/geocode';
const maxQueryLength = 500;
const defaultResultLimit = 5;
const maxResultLimit = 10;
const fieldsPattern = /^[a-z0-9_,.-]+$/i;
const countryPattern = /^[a-z]{2,3}$/i;

type GeocoderFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type GeocoderQueryResult =
	| {
			readonly ok: true;
			readonly query: GeocoderQuery;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

interface GeocoderQuery {
	readonly q: string;
	readonly country: string | null;
	readonly fields: string | null;
	readonly limit: number;
}

export function registerGeocoderRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly apiKey: string | null;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly fetchGeocoder?: GeocoderFetch;
	},
): void {
	const fetchGeocoder = options.fetchGeocoder ?? fetch;

	app.get('/geocoder/search', options.authContextMiddleware, async (context) => {
		if (options.apiKey === null) {
			return context.json({ error: 'geocoder_not_configured' }, 503);
		}

		const queryResult = parseGeocoderQuery(new URL(context.req.url).searchParams);
		if (!queryResult.ok) {
			return context.json({ error: 'invalid_query', reason: queryResult.reason }, 400);
		}

		const upstreamUrl = buildGeocodioUrl(queryResult.query, options.apiKey);
		let upstreamResponse: Response;
		try {
			upstreamResponse = await fetchGeocoder(upstreamUrl);
		} catch {
			return context.json({ error: 'geocoder_unavailable' }, 502);
		}

		const bodyResult = await readUpstreamJson(upstreamResponse);
		if (!bodyResult.ok) {
			return context.json({ error: 'invalid_geocoder_response' }, 502);
		}

		if (!upstreamResponse.ok) {
			return context.json(
				{
					error: 'geocoder_failed',
					status: upstreamResponse.status,
					response: bodyResult.body,
				},
				upstreamResponse.status === 429 ? 429 : 502,
			);
		}

		return context.json({
			provider: 'geocodio',
			query: {
				q: queryResult.query.q,
				country: queryResult.query.country,
				fields: queryResult.query.fields,
				limit: queryResult.query.limit,
			},
			results: readResults(bodyResult.body),
			response: bodyResult.body,
		});
	});
}

export function parseGeocoderQuery(searchParams: URLSearchParams): GeocoderQueryResult {
	const unknownParam = [...searchParams.keys()].find((param) => !geocoderQueryParams.has(param));
	if (unknownParam !== undefined) {
		return { ok: false, reason: `Unsupported geocoder query parameter: ${unknownParam}.` };
	}

	const q = readSingleTextParam(searchParams, 'q');
	if (!q.ok) {
		return q;
	}
	if (q.value === null) {
		return { ok: false, reason: 'q is required.' };
	}
	if (q.value.length > maxQueryLength) {
		return { ok: false, reason: `q must be ${maxQueryLength} characters or fewer.` };
	}

	const country = readSingleTextParam(searchParams, 'country');
	if (!country.ok) {
		return country;
	}
	if (country.value !== null && !countryPattern.test(country.value)) {
		return { ok: false, reason: 'country must be a 2 or 3 letter country code.' };
	}

	const fields = readSingleTextParam(searchParams, 'fields');
	if (!fields.ok) {
		return fields;
	}
	if (fields.value !== null && !fieldsPattern.test(fields.value)) {
		return {
			ok: false,
			reason: 'fields must contain only letters, numbers, commas, dots, dashes, or underscores.',
		};
	}

	const limit = readLimit(searchParams);
	if (!limit.ok) {
		return limit;
	}

	return {
		ok: true,
		query: {
			q: q.value,
			country: country.value?.toUpperCase() ?? null,
			fields: fields.value,
			limit: limit.value,
		},
	};
}

function buildGeocodioUrl(query: GeocoderQuery, apiKey: string): URL {
	const url = new URL(geocodioBaseUrl);
	url.searchParams.set('q', query.q);
	url.searchParams.set('api_key', apiKey);
	url.searchParams.set('limit', String(query.limit));
	if (query.country !== null) {
		url.searchParams.set('country', query.country);
	}
	if (query.fields !== null) {
		url.searchParams.set('fields', query.fields);
	}

	return url;
}

function readSingleTextParam(
	searchParams: URLSearchParams,
	param: string,
):
	| {
			readonly ok: true;
			readonly value: string | null;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  } {
	const values = searchParams.getAll(param);
	if (values.length === 0) {
		return { ok: true, value: null };
	}
	if (values.length > 1) {
		return { ok: false, reason: `${param} may only be provided once.` };
	}

	const value = values[0]?.trim() ?? '';
	return { ok: true, value: value.length === 0 ? null : value };
}

function readLimit(
	searchParams: URLSearchParams,
): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string } {
	const raw = readSingleTextParam(searchParams, 'limit');
	if (!raw.ok) {
		return raw;
	}
	if (raw.value === null) {
		return { ok: true, value: defaultResultLimit };
	}

	if (!/^\d+$/.test(raw.value)) {
		return { ok: false, reason: `limit must be between 1 and ${maxResultLimit}.` };
	}

	const parsed = Number(raw.value);
	if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxResultLimit) {
		return { ok: false, reason: `limit must be between 1 and ${maxResultLimit}.` };
	}

	return { ok: true, value: parsed };
}

async function readUpstreamJson(response: Response): Promise<
	| {
			readonly ok: true;
			readonly body: unknown;
	  }
	| {
			readonly ok: false;
	  }
> {
	try {
		return { ok: true, body: await response.json() };
	} catch {
		return { ok: false };
	}
}

function readResults(body: unknown): unknown[] {
	if (!isRecord(body) || !Array.isArray(body.results)) {
		return [];
	}

	return body.results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const geocoderQueryParams = new Set(['q', 'country', 'fields', 'limit']);
